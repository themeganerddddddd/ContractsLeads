from datetime import date, datetime, timezone

from movements.models import NormalizedMovement
from movements.validation import build_snapshot_match_report, companies_from_contract_snapshot


def _contract(company_id: str, legal_name: str, uei: str, award_id: str) -> dict:
    return {
        "id": award_id,
        "company": {
            "company_id": company_id,
            "canonical_name": legal_name,
            "legal_name": legal_name,
            "uei": uei,
        },
        "award": {"award_id": award_id},
        "source_url": f"https://www.usaspending.gov/award/{award_id}",
    }


def _movement(name: str, *, identifiers=()) -> NormalizedMovement:
    observed = datetime(2026, 10, 23, tzinfo=timezone.utc)
    return NormalizedMovement(
        event={
            "event_type": "layoff",
            "event_status": "announced",
            "event_date": date(2026, 10, 20),
            "primary_state": "VA",
        },
        source={
            "source_system": "virginia_warn",
            "original_url": "https://virginiaworks.gov/example.pdf",
            "document_identifier": "example",
            "collected_at": observed,
        },
        observed_company_name=name,
        location=None,
        identifiers=tuple(identifiers),
    )


def test_contract_snapshot_keeps_distinct_ueis_as_distinct_entities():
    candidates = companies_from_contract_snapshot([
        _contract("same-company-id", "Example Systems LLC", "UEI-ONE", "A-1"),
        _contract("same-company-id", "Example Systems LLC", "UEI-TWO", "A-2"),
    ])
    assert len(candidates) == 2
    assert {candidate["uei"] for candidate in candidates} == {"UEI-ONE", "UEI-TWO"}


def test_snapshot_report_separates_authoritative_pending_and_ambiguous_matches():
    contracts = [
        _contract("unique", "Unique Federal Vendor LLC", "UEI-UNIQUE", "A-1"),
        _contract("duplicate-one", "Shared Services LLC", "UEI-ONE", "A-2"),
        _contract("duplicate-two", "Shared Services LLC", "UEI-TWO", "A-3"),
    ]
    report = build_snapshot_match_report(
        contracts,
        [
            _movement("Unique Federal Vendor"),
            _movement("Unique Federal Vendor", identifiers=({"system": "UEI", "value": "UEI-UNIQUE"},)),
            _movement("Shared Services"),
            _movement("No Such Company"),
        ],
    )
    assert report["summary"] == {
        "procurement_companies": 3,
        "movement_events": 4,
        "authoritative_matched_events": 1,
        "pending_name_match_events": 1,
        "ambiguous_events": 1,
        "unmatched_events": 1,
        "candidate_linked_companies": 1,
    }
    statuses = [row["match_status"] for row in report["matches"]]
    assert statuses == ["pending_review", "authoritative", "ambiguous", "unmatched"]
    assert report["cross_source_company_examples"][0]["review_status"] == "pending_review"
