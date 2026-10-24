from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from ingestion.company_resolution import normalize_company_name

from .matching import match_company_name
from .models import CompanyMatch, NormalizedMovement


def _company_identity(company: dict[str, Any]) -> str | None:
    uei = str(company.get("uei") or "").strip().upper()
    if uei:
        return f"uei:{uei}"
    company_id = str(company.get("company_id") or "").strip()
    if company_id:
        return f"company:{company_id}"
    name = company.get("legal_name") or company.get("canonical_name")
    return f"name:{normalize_company_name(name)}" if normalize_company_name(name) else None


def companies_from_contract_snapshot(records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse contract rows into legal-entity candidates without merging UEIs."""
    companies: dict[str, dict[str, Any]] = {}
    for record in records:
        company = record.get("company") or {}
        identity = _company_identity(company)
        if not identity:
            continue
        candidate = companies.setdefault(
            str(identity),
            {
                "id": str(company.get("company_id") or identity),
                "entity_key": str(identity),
                "canonical_name": company.get("canonical_name") or company.get("legal_name"),
                "legal_name": company.get("legal_name") or company.get("canonical_name"),
                "uei": company.get("uei"),
                "cage_code": company.get("cage_code"),
                "ultimate_parent": company.get("ultimate_parent"),
                "procurement_records": 0,
                "award_ids": set(),
                "procurement_source_urls": set(),
            },
        )
        candidate["procurement_records"] += 1
        award = record.get("award") or {}
        award_id = award.get("award_id") or award.get("contract_number") or record.get("id")
        if award_id:
            candidate["award_ids"].add(str(award_id))
        source_url = record.get("source_url") or award.get("source_url")
        if source_url:
            candidate["procurement_source_urls"].add(str(source_url))
    return list(companies.values())


def _identifier_match(movement: NormalizedMovement, candidates: list[dict[str, Any]]) -> CompanyMatch | None:
    for identifier in movement.identifiers:
        system = str(identifier.get("system") or "").upper()
        value = str(identifier.get("value") or "").strip().upper()
        if not value or system not in {"UEI", "CAGE", "CAGE_CODE"}:
            continue
        field = "uei" if system == "UEI" else "cage_code"
        matches = [row for row in candidates if str(row.get(field) or "").strip().upper() == value]
        if len(matches) == 1:
            return CompanyMatch("matched", matches[0], tuple(matches), "uei" if field == "uei" else "cage_code", 1.0)
        if len(matches) > 1:
            return CompanyMatch("ambiguous", None, tuple(matches), "duplicate_verified_identifier", 1.0)
    return None


def build_snapshot_match_report(
    contract_records: Iterable[dict[str, Any]],
    movements: Iterable[NormalizedMovement],
    *,
    source_runs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Compare live official movement evidence with the checked-in procurement snapshot.

    Name-only links remain validation candidates. Only unique UEI/CAGE links are
    classified as authoritative, mirroring the production review boundary.
    """
    candidates = companies_from_contract_snapshot(contract_records)
    results: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()
    company_examples: dict[str, dict[str, Any]] = {}

    for movement in movements:
        identifier_match = _identifier_match(movement, candidates)
        match = identifier_match or match_company_name(movement.observed_company_name, candidates)
        counts[match.status] += 1
        authoritative = bool(match.company and match.method in {"uei", "cage_code", "sec_cik"})
        if authoritative:
            counts["authoritative"] += 1
        elif match.company:
            counts["pending_review"] += 1

        event = movement.event
        source = movement.source
        matched_company = match.company
        row = {
            "observed_company_name": movement.observed_company_name,
            "event_type": event.get("event_type"),
            "event_status": event.get("event_status"),
            "event_date": event.get("event_date") or event.get("effective_start_date") or event.get("announced_date"),
            "state": event.get("primary_state"),
            "county_fips": event.get("primary_county_fips"),
            "source_system": source.get("source_system"),
            "original_url": source.get("original_url"),
            "document_identifier": source.get("document_identifier"),
            "match_status": "authoritative" if authoritative else "pending_review" if matched_company else match.status,
            "match_method": match.method,
            "match_confidence": match.confidence,
            "candidate_company_id": matched_company.get("id") if matched_company else None,
            "candidate_company_name": matched_company.get("canonical_name") if matched_company else None,
            "candidate_uei": matched_company.get("uei") if matched_company else None,
            "candidate_count": len(match.candidates),
        }
        results.append(row)

        if not matched_company:
            continue
        company_id = str(matched_company["id"])
        entity_key = str(matched_company.get("entity_key") or company_id)
        example = company_examples.setdefault(
            entity_key,
            {
                "company_id": company_id,
                "canonical_name": matched_company.get("canonical_name"),
                "legal_name": matched_company.get("legal_name"),
                "uei": matched_company.get("uei"),
                "ultimate_parent": matched_company.get("ultimate_parent"),
                "procurement_records": matched_company.get("procurement_records", 0),
                "award_count": len(matched_company.get("award_ids") or []),
                "procurement_source_urls": sorted(matched_company.get("procurement_source_urls") or []),
                "movement_events": 0,
                "event_types": set(),
                "states": set(),
                "movement_sources": set(),
                "evidence_urls": set(),
                "match_methods": set(),
                "review_status": "authoritative" if authoritative else "pending_review",
                "minimum_confidence": match.confidence,
            },
        )
        example["movement_events"] += 1
        if event.get("event_type"):
            example["event_types"].add(str(event["event_type"]))
        if event.get("primary_state"):
            example["states"].add(str(event["primary_state"]))
        if source.get("source_system"):
            example["movement_sources"].add(str(source["source_system"]))
        if source.get("original_url"):
            example["evidence_urls"].add(str(source["original_url"]))
        if match.method:
            example["match_methods"].add(match.method)
        if match.confidence is not None:
            current = example.get("minimum_confidence")
            example["minimum_confidence"] = min(current, match.confidence) if current is not None else match.confidence
        if not authoritative:
            example["review_status"] = "pending_review"

    examples = []
    for example in company_examples.values():
        for key in ("event_types", "states", "movement_sources", "evidence_urls", "match_methods"):
            example[key] = sorted(example[key])
        examples.append(example)
    examples.sort(key=lambda item: (-item["movement_events"], -item["procurement_records"], item["canonical_name"] or ""))

    source_counts: dict[str, Counter[str]] = defaultdict(Counter)
    for row in results:
        source = row.get("source_system") or "unknown"
        source_counts[source]["events"] += 1
        source_counts[source][row["match_status"]] += 1

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": {
            "procurement_input": "checked-in production contract snapshot",
            "movement_input": "bounded live official-source collection",
            "production_database_written": False,
            "name_only_links_authoritative": False,
        },
        "summary": {
            "procurement_companies": len(candidates),
            "movement_events": len(results),
            "authoritative_matched_events": counts["authoritative"],
            "pending_name_match_events": counts["pending_review"],
            "ambiguous_events": counts["ambiguous"],
            "unmatched_events": counts["unmatched"],
            "candidate_linked_companies": len(examples),
        },
        "source_runs": source_runs or [],
        "source_match_counts": [
            {"source_system": source, **dict(values)} for source, values in sorted(source_counts.items())
        ],
        "cross_source_company_examples": examples,
        "matches": results,
        "interpretation": {
            "authoritative": "Unique verified UEI, CAGE, or SEC CIK links may be approved automatically.",
            "pending_review": "A unique normalized legal-name candidate is useful but remains pending until identifier or reviewed corporate evidence confirms it.",
            "ambiguous": "Multiple legal entities or close candidates were found; no automatic company relationship is asserted.",
            "unmatched": "No defensible procurement company candidate was found in the snapshot.",
        },
    }


def write_snapshot_match_report(report: dict[str, Any], output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "company-movement-snapshot-validation.json"
    markdown_path = output_dir / "company-movement-snapshot-validation.md"
    json_path.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")
    summary = report["summary"]
    lines = [
        "# Company movement snapshot validation",
        "",
        f"Generated: {report['generated_at']}",
        "",
        "> This is a non-production comparison of bounded live official movement sources against the checked-in production contract snapshot. It does not prove that migration 0012 or these records are present in the production database.",
        "",
        "## Match summary",
        "",
        f"- Procurement companies: {summary['procurement_companies']}",
        f"- Movement events reviewed: {summary['movement_events']}",
        f"- Authoritative identifier-matched events: {summary['authoritative_matched_events']}",
        f"- Unique name candidates pending review: {summary['pending_name_match_events']}",
        f"- Ambiguous events: {summary['ambiguous_events']}",
        f"- Unmatched events: {summary['unmatched_events']}",
        f"- Candidate-linked company profiles: {summary['candidate_linked_companies']}",
        "",
        "## Source runs",
        "",
        "| Source | Received | Normalized | Failed | Status |",
        "|---|---:|---:|---:|---|",
    ]
    for run in report.get("source_runs") or []:
        lines.append(
            f"| {run.get('source_system') or 'unknown'} | {run.get('received', 0)} | "
            f"{run.get('normalized', 0)} | {run.get('failed', 0)} | {run.get('status') or 'unknown'} |"
        )
    lines.extend([
        "",
        "## Cross-source company examples",
        "",
        "| Company | UEI | Procurement records | Movement events | Types | States | Match status | Evidence |",
        "|---|---|---:|---:|---|---|---|---|",
    ])
    for example in report["cross_source_company_examples"][:25]:
        evidence = " ".join(f"[source {index + 1}]({url})" for index, url in enumerate(example["evidence_urls"][:3]))
        lines.append(
            f"| {example['canonical_name']} | {example.get('uei') or 'not reported'} | "
            f"{example['procurement_records']} | {example['movement_events']} | "
            f"{', '.join(example['event_types']) or 'not reported'} | "
            f"{', '.join(example['states']) or 'not reported'} | {example['review_status']} | {evidence} |"
        )
    lines.extend([
        "",
        "## Interpretation",
        "",
        "Name-only candidates are deliberately not counted as authoritative matches. They demonstrate that the two source families can be joined for review, while preserving the requirement for verified identifiers or reviewed corporate evidence before an automatic company-level indicator is created.",
    ])
    markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return [json_path, markdown_path]
