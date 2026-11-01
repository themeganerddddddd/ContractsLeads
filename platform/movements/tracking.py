from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Iterable

from procurement_materiality import evaluate_award_adjustment


PROCUREMENT_SOURCES = ("usaspending", "uk_find_a_tender", "eu_ted")
MOVEMENT_SOURCES = ("maryland_warn", "virginia_warn", "maryland_commerce_press")
PERMIT_SOURCES = ("montgomery_county_commercial_permits",)
SEC_SOURCES = ("sec_edgar_submissions",)
ALL_MONITOR_SOURCES = PROCUREMENT_SOURCES + MOVEMENT_SOURCES + PERMIT_SOURCES + SEC_SOURCES


def procurement_alert_type(event_type: str) -> str:
    if event_type in {"award_announced", "contract_signed"}:
        return "new_award"
    if event_type in {
        "contract_modified",
        "value_increased",
        "value_decreased",
        "option_exercised",
        "renewal_expected",
    }:
        return "contract_modified"
    return "procurement_event"


def _compact_native_amount(value: Any, currency: str | None) -> str:
    amount = abs(Decimal(str(value)))
    prefix = "$" if str(currency or "").upper() == "USD" else f"{currency or 'Native'} "
    if amount >= Decimal("1000000"):
        return f"{prefix}{amount / Decimal('1000000'):.1f}M"
    if amount >= Decimal("1000"):
        return f"{prefix}{amount / Decimal('1000'):.1f}K"
    return f"{prefix}{amount:,.2f}"


def collapse_procurement_alert_events(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse correlated lifecycle rows for alerts while preserving source events."""
    correlated_types = {"contract_modified", "value_increased", "value_decreased", "option_exercised"}
    groups: dict[str, list[dict[str, Any]]] = {}
    presented: list[dict[str, Any]] = []
    for source_row in rows:
        row = dict(source_row)
        if row.get("event_type") in correlated_types and row.get("raw_source_id") and row.get("award_id"):
            key = f"{row['source_system']}|{row['raw_source_id']}|{row['award_id']}"
            groups.setdefault(key, []).append(row)
        else:
            presented.append(row)

    for group in groups.values():
        option = next((row for row in group if row["event_type"] == "option_exercised"), None)
        modification = next((row for row in group if row["event_type"] == "contract_modified"), None)
        base = dict(option or modification or group[0])
        adjustment_row = next((row for row in group if row.get("adjustment_delta") is not None), base)
        adjustment = adjustment_row.get("adjustment_delta")
        evaluation = evaluate_award_adjustment(
            adjustment,
            adjustment_row.get("reference_award_value"),
            adjustment_row.get("currency"),
        ) if adjustment is not None else None
        direction = None
        if adjustment is not None and Decimal(str(adjustment)) != 0:
            direction = "increased" if Decimal(str(adjustment)) > 0 else "decreased"
        percent = evaluation.percent if evaluation else None
        percent_text = format(percent, ".1f").rstrip("0").rstrip(".") if percent is not None else None
        context = f" · {percent_text}% of award value" if percent_text is not None else ""

        if option:
            base["event_type"] = "option_exercised"
            base["title"] = "Option exercised"
            base["summary"] = (
                f"Award value {direction} by {_compact_native_amount(adjustment, adjustment_row.get('currency'))}{context}"
                if evaluation and evaluation.status == "material" and direction else
                "Option exercise recorded; no immaterial adjustment amount is promoted."
            )
        elif evaluation and evaluation.status == "material" and direction:
            base["event_type"] = "value_increased" if direction == "increased" else "value_decreased"
            base["title"] = f"Award {direction} by {_compact_native_amount(adjustment, adjustment_row.get('currency'))}"
            base["summary"] = f"Material contract modification{context}."
        else:
            base["event_type"] = "contract_modified"
            base["title"] = "Award adjusted"
            base["summary"] = (
                "Minor contract modification. Exact source values remain available in contract detail."
                if evaluation and evaluation.status == "immaterial" else
                "Contract modification. Exact source values remain available in contract detail."
            )
        base["materiality_status"] = evaluation.status if evaluation else None
        base["materiality_percent"] = percent
        base["correlated_event_count"] = len(group)
        presented.append(base)
    return sorted(presented, key=lambda row: (row.get("event_date") or "", row.get("id") or ""))


def monitor_alert_key(target_id: str, source_type: str, source_id: str) -> str:
    return f"monitor:{target_id}:{source_type}:{source_id}"


def discovery_key(source_type: str, source_id: str, company_id: str | None) -> str:
    """Return a stable key while a discovery moves through review states."""
    return f"discovery:{source_type}:{source_id}:{company_id or 'unresolved'}"


def saved_search_alert_key(search_id: str, source_type: str, source_id: str, company_id: str | None) -> str:
    return f"saved-search:{search_id}:{source_type}:{source_id}:{company_id or 'unresolved'}"


def _filter_value(definition: dict[str, Any], *names: str) -> Any:
    for name in names:
        value = definition.get(name)
        if value not in (None, ""):
            return value
    return None


def _same(left: Any, right: Any) -> bool:
    return str(left or "").strip().casefold() == str(right or "").strip().casefold()


def saved_search_matches(definition: dict[str, Any], row: dict[str, Any]) -> bool:
    """Match a discovery without conflating entity and activity geography."""
    exact_filters = (
        (("recipientState", "recipient_state"), "recipient_state"),
        (("recipientCounty", "recipient_county"), "recipient_county"),
        (("recipientCity", "recipient_city"), "recipient_city"),
        (("recipientZip", "recipient_zip"), "recipient_zip"),
        (("supplierCountry", "supplier_country"), "recipient_country"),
        (("performanceState", "performance_state"), "activity_state"),
        (("performanceCounty", "performance_county"), "activity_county"),
        (("performanceCity", "performance_city"), "activity_city"),
        (("performanceZip", "performance_zip"), "activity_zip"),
        (("placeCountry", "place_country"), "activity_country"),
        (("industry",), "industry_slug"),
        (("agency",), "agency"),
        (("market",), "market"),
    )
    for aliases, row_key in exact_filters:
        expected = _filter_value(definition, *aliases)
        if expected is not None and not _same(expected, row.get(row_key)):
            return False
    signal_type = str(_filter_value(definition, "signalType", "signal_type") or "").casefold()
    if signal_type:
        source_type = str(row.get("source_type") or "")
        source_system = str(row.get("source_system") or "")
        family_matches = {
            "contracts": source_type == "procurement_event",
            "procurement": source_type == "procurement_event",
            "movements": source_type == "company_event" and source_system != "sec_edgar_submissions",
            "permits": source_type == "permit",
            "sec": source_system == "sec_edgar_submissions",
        }
        if signal_type in family_matches and not family_matches[signal_type]:
            return False
        if signal_type not in family_matches and not _same(signal_type, row.get("event_type")):
            return False
    query = str(_filter_value(definition, "q") or "").strip().casefold()
    if query and query not in " ".join(
        str(row.get(key) or "") for key in ("canonical_name", "title", "summary", "event_type")
    ).casefold():
        return False
    event_date = str(row.get("event_date") or "")[:10]
    date_from = str(_filter_value(definition, "dateFrom", "date_from") or "")[:10]
    date_to = str(_filter_value(definition, "dateTo", "date_to") or "")[:10]
    if date_from and (not event_date or event_date < date_from):
        return False
    if date_to and (not event_date or event_date > date_to):
        return False
    return True


def is_region_search(definition: dict[str, Any]) -> bool:
    geography_keys = {
        "recipientState", "recipient_state", "recipientCounty", "recipient_county",
        "recipientCity", "recipient_city", "recipientZip", "recipient_zip",
        "performanceState", "performance_state", "performanceCounty", "performance_county",
        "performanceCity", "performance_city", "performanceZip", "performance_zip",
        "supplierCountry", "supplier_country", "placeCountry", "place_country",
    }
    return any(definition.get(key) not in (None, "") for key in geography_keys)


@dataclass(frozen=True)
class SourcePolicy:
    flag: str
    success_status: str
    detail: str


SOURCE_POLICIES = {
    "usaspending": SourcePolicy("monitor_procurement", "healthy", "Nationwide U.S. procurement records linked to this legal entity."),
    "uk_find_a_tender": SourcePolicy("monitor_procurement", "healthy", "UK records only where this legal entity is linked."),
    "eu_ted": SourcePolicy("monitor_procurement", "healthy", "EU/TED records only where this legal entity is linked."),
    "maryland_warn": SourcePolicy("monitor_movements", "partial", "Maryland workforce notices; not nationwide WARN coverage."),
    "virginia_warn": SourcePolicy("monitor_movements", "partial", "Virginia workforce notices; not nationwide WARN coverage."),
    "maryland_commerce_press": SourcePolicy("monitor_movements", "partial", "Maryland official expansion announcements only."),
    "montgomery_county_commercial_permits": SourcePolicy("monitor_permits", "partial", "Montgomery County permits with a verified or reviewed company relationship only."),
    "sec_edgar_submissions": SourcePolicy("monitor_sec", "healthy", "Selected SEC filings for a verified CIK only."),
}


class CompanyTrackingService:
    """Coordinate platform tracking over canonical event tables without recollection."""

    def __init__(self, connection: Any):
        self.connection = connection

    def add_target(
        self,
        company_id: str,
        *,
        reason: str = "manually_added",
        priority: str = "normal",
        actor: str = "cli",
        notes: str | None = None,
        monitor_procurement: bool = True,
        monitor_movements: bool = True,
        monitor_permits: bool = True,
        monitor_sec: bool = True,
    ) -> dict[str, Any]:
        company = self.connection.execute(
            """SELECT id::text,canonical_name,legal_name,uei,cage_code
               FROM companies WHERE id=%s AND NOT is_benchmark""",
            (company_id,),
        ).fetchone()
        if not company:
            raise ValueError("A canonical non-benchmark company_id is required")
        previous = self.connection.execute(
            "SELECT * FROM company_monitor_targets WHERE company_id=%s",
            (company_id,),
        ).fetchone()
        target = self.connection.execute(
            """INSERT INTO company_monitor_targets (
                 company_id,tracking_status,tracking_reason,priority,added_by,notes,
                 monitor_procurement,monitor_movements,monitor_permits,monitor_sec
               ) VALUES (%s,'active',%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (company_id) DO UPDATE SET
                 tracking_status='active',tracking_reason=EXCLUDED.tracking_reason,
                 priority=EXCLUDED.priority,notes=COALESCE(EXCLUDED.notes,company_monitor_targets.notes),
                 monitor_procurement=EXCLUDED.monitor_procurement,
                 monitor_movements=EXCLUDED.monitor_movements,
                 monitor_permits=EXCLUDED.monitor_permits,monitor_sec=EXCLUDED.monitor_sec,
                 last_reviewed_at=now(),updated_at=now()
               RETURNING id::text,company_id::text,tracking_status,tracking_reason,priority,
                 monitor_procurement,monitor_movements,monitor_permits,monitor_sec,created_at,updated_at""",
            (
                company_id,
                reason,
                priority,
                actor,
                notes,
                monitor_procurement,
                monitor_movements,
                monitor_permits,
                monitor_sec,
            ),
        ).fetchone()
        self._audit_target(
            target["id"],
            "activated" if previous else "created",
            dict(previous) if previous else {},
            dict(target),
            actor,
        )
        self._initialize_source_states(target)
        self.connection.execute(
            """UPDATE company_discoveries SET discovery_status='tracked',reviewed_by=%s,reviewed_at=now()
               WHERE company_id=%s AND discovery_status IN ('new','under_review')""",
            (actor, company_id),
        )
        self.connection.commit()
        return {**dict(target), "company": dict(company)}

    def update_target(
        self,
        company_id: str,
        *,
        actor: str,
        status: str | None = None,
        priority: str | None = None,
        notes: str | None = None,
        source_flags: dict[str, bool] | None = None,
    ) -> dict[str, Any]:
        before = self.connection.execute(
            "SELECT * FROM company_monitor_targets WHERE company_id=%s",
            (company_id,),
        ).fetchone()
        if not before:
            raise ValueError("Company is not in the platform tracking registry")
        flags = source_flags or {}
        after = self.connection.execute(
            """UPDATE company_monitor_targets SET
                 tracking_status=COALESCE(%s,tracking_status),priority=COALESCE(%s,priority),
                 notes=COALESCE(%s,notes),
                 monitor_procurement=COALESCE(%s,monitor_procurement),
                 monitor_movements=COALESCE(%s,monitor_movements),
                 monitor_permits=COALESCE(%s,monitor_permits),
                 monitor_sec=COALESCE(%s,monitor_sec),
                 monitor_hiring=COALESCE(%s,monitor_hiring),
                 monitor_property=COALESCE(%s,monitor_property),
                 last_reviewed_at=now(),updated_at=now()
               WHERE company_id=%s RETURNING *""",
            (
                status,
                priority,
                notes,
                flags.get("monitor_procurement"),
                flags.get("monitor_movements"),
                flags.get("monitor_permits"),
                flags.get("monitor_sec"),
                flags.get("monitor_hiring"),
                flags.get("monitor_property"),
                company_id,
            ),
        ).fetchone()
        action = (
            "paused" if status == "paused" else "archived" if status == "archived" else
            "review_required" if status == "review_required" else
            "activated" if status == "active" else "priority_changed" if priority else
            "sources_changed" if flags else "notes_changed"
        )
        self._audit_target(before["id"], action, dict(before), dict(after), actor)
        self._initialize_source_states(after)
        self.connection.commit()
        return dict(after)

    def materialize_discoveries(self, *, limit: int = 1000) -> dict[str, int]:
        procurement = self.connection.execute(
            """SELECT e.id::text AS source_id,e.company_id::text,c.canonical_name,e.event_type,e.source_system,
               e.source_url,e.event_at::date AS event_date,e.title,e.source_country,e.evidence
               FROM procurement_events e JOIN companies c ON c.id=e.company_id
               WHERE e.company_id IS NOT NULL ORDER BY e.event_at DESC LIMIT %s""",
            (limit,),
        ).fetchall()
        movement = self.connection.execute(
            """SELECT e.id::text AS source_id,ec.company_id::text,c.canonical_name,e.event_type,e.source_system,
               source.original_url AS source_url,
               COALESCE(e.event_date,e.effective_start_date,e.announced_date) AS event_date,
               e.title,ec.review_status AS match_status,ec.matching_method,ec.matching_confidence,e.evidence
               FROM company_event_companies ec JOIN company_events e ON e.id=ec.event_id
               JOIN companies c ON c.id=ec.company_id
               JOIN LATERAL (
                 SELECT original_url FROM company_event_sources WHERE event_id=e.id
                 ORDER BY is_primary DESC,collected_at DESC LIMIT 1
               ) source ON true
               WHERE e.verification_status <> 'rejected'
               ORDER BY COALESCE(e.event_date,e.effective_start_date,e.announced_date) DESC NULLS LAST LIMIT %s""",
            (limit,),
        ).fetchall()
        permits = self.connection.execute(
            """SELECT p.id::text AS source_id,r.company_id::text,c.canonical_name,
               p.relevance_classification AS event_type,p.source_system,p.source_url,
               COALESCE(p.issue_date,p.application_date) AS event_date,p.permit_number AS title,
               r.review_status AS match_status,r.matching_method,r.matching_confidence,r.evidence
               FROM permit_company_relationships r JOIN development_permits p ON p.id=r.permit_id
               JOIN companies c ON c.id=r.company_id
               WHERE r.review_status <> 'rejected'
               ORDER BY COALESCE(p.issue_date,p.application_date) DESC NULLS LAST LIMIT %s""",
            (limit,),
        ).fetchall()
        unresolved = self.connection.execute(
            """SELECT source.event_id::text AS source_id,r.candidate_company_id::text AS company_id,
               r.observed_company_name AS canonical_name,e.event_type,e.source_system,source.original_url AS source_url,
               COALESCE(e.event_date,e.effective_start_date,e.announced_date) AS event_date,e.title,
               r.match_status,r.matching_method,r.confidence AS matching_confidence,r.evidence
               FROM company_match_reviews r JOIN company_event_sources source ON source.id=r.source_id
               JOIN company_events e ON e.id=source.event_id
               WHERE r.match_status IN ('ambiguous','unmatched','rejected')
               ORDER BY r.created_at DESC LIMIT %s""",
            (limit,),
        ).fetchall()
        indications = self.connection.execute(
            """SELECT ma.id::text AS source_id,ma.company_id::text,c.canonical_name,
               ma.assessment_type AS event_type,ma.components->'items'->0->>'source_system' AS source_system,
               ma.components->'items'->0->>'source_url' AS source_url,ma.as_of_date AS event_date,
               initcap(replace(ma.assessment_type,'_',' ')) || ' indication' AS title,
               'approved'::text AS match_status,'company-change-indication-v2'::text AS matching_method,
               1.0::numeric AS matching_confidence,ma.components AS evidence
               FROM movement_assessments ma JOIN companies c ON c.id=ma.company_id
               WHERE ma.model_version='company-change-indication-v2' AND ma.score>=70
                 AND ma.assessment_type IN ('expansion','relocation','growth','contraction')
                 AND ma.components->'items'->0->>'source_url' IS NOT NULL
               ORDER BY ma.as_of_date DESC,ma.generated_at DESC LIMIT %s""",
            (limit,),
        ).fetchall()
        inserted = 0
        for row in procurement:
            reason = "new_award" if row["event_type"] in {"award_announced", "contract_signed"} else "contract_change"
            inserted += self._upsert_discovery(
                row,
                reason=reason,
                source_type="procurement_event",
                match_status="auto_verified",
            )
        for row in movement:
            reason = "sec_signal" if row["source_system"] in SEC_SOURCES else "movement_signal"
            inserted += self._upsert_discovery(
                row,
                reason=reason,
                source_type="company_event",
                match_status=row["match_status"],
            )
        for row in permits:
            inserted += self._upsert_discovery(
                row,
                reason="permit_signal",
                source_type="permit",
                match_status=row["match_status"],
            )
        for row in unresolved:
            reason = "sec_signal" if row["source_system"] in SEC_SOURCES else "movement_signal"
            inserted += self._upsert_discovery(
                row,
                reason=reason,
                source_type="company_event",
                match_status=row["match_status"],
            )
        for row in indications:
            inserted += self._upsert_discovery(
                row,
                reason=f"{row['event_type']}_indication",
                source_type="movement_assessment",
                match_status="approved",
            )
        self.connection.commit()
        return {
            "records_considered": len(procurement) + len(movement) + len(permits) + len(unresolved) + len(indications),
            "discoveries_inserted": inserted,
        }

    def evaluate_active_targets(self, *, limit: int | None = None) -> dict[str, Any]:
        sql = """SELECT t.*,c.canonical_name FROM company_monitor_targets t
                 JOIN companies c ON c.id=t.company_id WHERE t.tracking_status='active'
                 ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,t.updated_at"""
        values: tuple[Any, ...] = ()
        if limit is not None:
            sql += " LIMIT %s"
            values = (limit,)
        targets = self.connection.execute(sql, values).fetchall()
        result = {"targets": len(targets), "alerts_inserted": 0, "source_failures": []}
        for target in targets:
            target_result = self._evaluate_target(dict(target))
            result["alerts_inserted"] += target_result["alerts_inserted"]
            result["source_failures"].extend(target_result["source_failures"])
        result["status"] = "partial" if result["source_failures"] else "success"
        return result

    def evaluate_saved_searches(self, *, limit: int = 1000) -> dict[str, Any]:
        """Generate private saved-search and region alerts from canonical discoveries."""
        searches = self.connection.execute(
            """SELECT id::text,user_id::text,name,query_json,alert_frequency,last_run,updated_at
               FROM saved_searches WHERE
                 (alert_frequency='daily' AND (last_run IS NULL OR last_run <= now() - interval '1 day')) OR
                 (alert_frequency='weekly' AND (last_run IS NULL OR last_run <= now() - interval '7 days'))
               ORDER BY updated_at"""
        ).fetchall()
        result: dict[str, Any] = {"searches": len(searches), "alerts_inserted": 0, "failures": []}
        for search_row in searches:
            search = dict(search_row)
            try:
                candidates = self._saved_search_candidates(search.get("last_run") or search["updated_at"], limit)
                for candidate in candidates:
                    row = dict(candidate)
                    if saved_search_matches(search.get("query_json") or {}, row):
                        result["alerts_inserted"] += self._insert_saved_search_alert(search, row)
                self.connection.execute("UPDATE saved_searches SET last_run=now() WHERE id=%s", (search["id"],))
                self.connection.commit()
            except Exception as exc:
                self.connection.rollback()
                result["failures"].append({
                    "saved_search_id": search["id"],
                    "error": f"{type(exc).__name__}: {exc}",
                })
        result["status"] = "partial" if result["failures"] else "success"
        return result

    def _saved_search_candidates(self, since: datetime | None, limit: int) -> list[dict[str, Any]]:
        return [dict(row) for row in self.connection.execute(
            """SELECT d.company_id::text,d.discovery_reason,d.source_system,d.source_type,d.source_id,
               d.source_url,d.event_date,d.match_status,c.canonical_name,c.recipient_state,c.recipient_county,
               c.recipient_city,c.recipient_zip,c.recipient_country,i.slug AS industry_slug,
               COALESCE(pe.event_type,ce.event_type,dp.relevance_classification) AS event_type,
               COALESCE(pe.title,ce.title,dp.permit_number) AS title,
               COALESCE(pe.description,ce.summary,dp.description) AS summary,
               COALESCE(pe.source_market,pe.source_country,ce.source_country,dp.country_code) AS market,
               COALESCE(a.awarding_agency,b.name) AS agency,
               CASE WHEN d.source_type='procurement_event' THEN a.performance_state
                    WHEN d.source_type='company_event' THEN ce.primary_state
                    WHEN d.source_type='permit' THEN dp.state_code END AS activity_state,
               CASE WHEN d.source_type='procurement_event' THEN a.performance_county
                    WHEN d.source_type='company_event' THEN ce.primary_county
                    WHEN d.source_type='permit' THEN dp.county END AS activity_county,
               CASE WHEN d.source_type='procurement_event' THEN a.performance_city
                    WHEN d.source_type='company_event' THEN ce.primary_city
                    WHEN d.source_type='permit' THEN dp.city END AS activity_city,
               CASE WHEN d.source_type='procurement_event' THEN a.performance_zip
                    WHEN d.source_type='company_event' THEN ce.primary_postal_code
                    WHEN d.source_type='permit' THEN dp.postal_code END AS activity_zip,
               CASE WHEN d.source_type='procurement_event' THEN COALESCE(a.performance_country,pe.source_country)
                    WHEN d.source_type='company_event' THEN ce.source_country
                    WHEN d.source_type='permit' THEN dp.country_code END AS activity_country
               FROM company_discoveries d LEFT JOIN companies c ON c.id=d.company_id
               LEFT JOIN industries i ON i.id=c.primary_industry_id
               LEFT JOIN procurement_events pe ON d.source_type='procurement_event' AND pe.id::text=d.source_id
               LEFT JOIN awards a ON a.id=pe.award_id
               LEFT JOIN buyers b ON b.id=pe.buyer_id
               LEFT JOIN company_events ce ON d.source_type='company_event' AND ce.id::text=d.source_id
               LEFT JOIN development_permits dp ON d.source_type='permit' AND dp.id::text=d.source_id
               WHERE d.last_observed_at > COALESCE(%s,now() - interval '30 days')
                 AND d.match_status IN ('auto_verified','approved')
                 AND d.discovery_status <> 'dismissed'
               ORDER BY d.last_observed_at LIMIT %s""",
            (since, limit),
        ).fetchall()]

    def _insert_saved_search_alert(self, search: dict[str, Any], row: dict[str, Any]) -> int:
        if not row.get("event_date"):
            return 0
        alert_type = "region_event" if is_region_search(search.get("query_json") or {}) else "saved_search_match"
        result = self.connection.execute(
            """INSERT INTO alert_events (
                 dedupe_key,user_id,company_id,saved_search_id,alert_type,title,summary,event_date,market,
                 source_type,source_id,source_system,source_url,match_status
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (dedupe_key) DO NOTHING RETURNING id""",
            (
                saved_search_alert_key(search["id"], row["source_type"], row["source_id"], row.get("company_id")),
                search["user_id"], row.get("company_id"), search["id"], alert_type,
                f"{search['name']}: {row.get('canonical_name') or 'new source match'}",
                row.get("title") or row.get("summary") or row["discovery_reason"].replace("_", " "),
                row["event_date"], row.get("market"), row["source_type"], row["source_id"],
                row["source_system"], row["source_url"], row.get("match_status"),
            ),
        ).fetchone()
        return int(bool(result))

    def review_match(self, review_id: str, *, decision: str, actor: str, notes: str | None = None) -> dict[str, Any]:
        review = self.connection.execute(
            """SELECT r.*,source.event_id::text,source.original_url
               FROM company_match_reviews r JOIN company_event_sources source ON source.id=r.source_id
               WHERE r.id=%s FOR UPDATE""",
            (review_id,),
        ).fetchone()
        if not review:
            raise ValueError("Match review was not found")
        if decision == "approved" and not review["candidate_company_id"]:
            raise ValueError("An unresolved review cannot be approved without an exact company candidate")
        self.connection.execute(
            """UPDATE company_match_reviews SET match_status=%s,reviewed_by=%s,reviewed_at=now()
               WHERE id=%s""",
            (decision, actor, review_id),
        )
        if review["candidate_company_id"]:
            if decision == "approved":
                self.connection.execute(
                    """INSERT INTO company_event_companies (
                         event_id,company_id,observed_company_name,relationship_type,is_primary,matching_method,
                         matching_confidence,matching_evidence,review_status
                       ) VALUES (%s,%s,%s,'subject',true,%s,%s,%s::jsonb,'approved')
                       ON CONFLICT (event_id,company_id,relationship_type) DO UPDATE SET
                         matching_method=EXCLUDED.matching_method,matching_confidence=EXCLUDED.matching_confidence,
                         matching_evidence=EXCLUDED.matching_evidence,review_status='approved'""",
                    (
                        review["event_id"],
                        review["candidate_company_id"],
                        review["observed_company_name"],
                        review["matching_method"] or "analyst_review",
                        review["confidence"] or 0,
                        json.dumps({
                            **(review["evidence"] or {}),
                            "approved_by": actor,
                            "approved_at": datetime.now(timezone.utc).isoformat(),
                            "source_url": review["original_url"],
                        }),
                    ),
                )
            elif decision == "rejected":
                self.connection.execute(
                    """UPDATE company_event_companies SET review_status='rejected'
                       WHERE event_id=%s AND company_id=%s""",
                    (review["event_id"], review["candidate_company_id"]),
                )
        self.connection.execute(
            """INSERT INTO company_match_review_actions (
                 review_id,previous_status,new_status,acted_by,notes
               ) VALUES (%s,%s,%s,%s,%s)""",
            (review_id, review["match_status"], decision, actor, notes),
        )
        self.connection.commit()
        return {"review_id": review_id, "previous_status": review["match_status"], "new_status": decision}

    def _initialize_source_states(self, target: Any) -> None:
        for source_system, policy in SOURCE_POLICIES.items():
            enabled = bool(target[policy.flag])
            status = "unsupported" if enabled else "not_applicable"
            detail = policy.detail if enabled else "Monitoring for this source family is disabled for this target."
            if source_system in SEC_SOURCES and enabled and not self._has_verified_cik(str(target["company_id"])):
                status = "not_applicable"
                detail = "Verified SEC CIK required before SEC monitoring can run."
            self.connection.execute(
                """INSERT INTO company_monitor_source_state (
                     company_monitor_target_id,source_system,status,status_detail
                   ) VALUES (%s,%s,%s,%s)
                   ON CONFLICT (company_monitor_target_id,source_system) DO UPDATE SET
                     status=CASE WHEN %s THEN EXCLUDED.status
                       WHEN company_monitor_source_state.last_checked_at IS NULL THEN EXCLUDED.status
                       ELSE company_monitor_source_state.status END,
                     status_detail=EXCLUDED.status_detail,updated_at=now()""",
                (target["id"], source_system, status, detail, status == "not_applicable"),
            )

    def _evaluate_target(self, target: dict[str, Any]) -> dict[str, Any]:
        result: dict[str, Any] = {"alerts_inserted": 0, "source_failures": []}
        for source_system, policy in SOURCE_POLICIES.items():
            try:
                new_count = self._evaluate_source(target, source_system, policy)
                result["alerts_inserted"] += new_count
                self.connection.commit()
            except Exception as exc:
                self.connection.rollback()
                error = f"{type(exc).__name__}: {exc}"
                self.connection.execute(
                    """UPDATE company_monitor_source_state SET status='error',last_checked_at=now(),
                       last_error_at=now(),last_error_message=%s,updated_at=now()
                       WHERE company_monitor_target_id=%s AND source_system=%s""",
                    (error, target["id"], source_system),
                )
                self.connection.commit()
                result["source_failures"].append({
                    "company_id": target["company_id"], "source_system": source_system, "error": error,
                })
        return result

    def _evaluate_source(self, target: dict[str, Any], source_system: str, policy: SourcePolicy) -> int:
        if not target[policy.flag]:
            self._update_source_state(target["id"], source_system, "not_applicable", policy.detail, 0, 0, None)
            return 0
        if source_system in SEC_SOURCES and not self._has_verified_cik(str(target["company_id"])):
            self._update_source_state(
                target["id"], source_system, "not_applicable",
                "Verified SEC CIK required before SEC monitoring can run.", 0, 0, None,
            )
            return 0
        checkpoint_status = self._latest_checkpoint_status(source_system)
        if checkpoint_status == "failed":
            raise RuntimeError("Latest source collection failed; canonical records were not evaluated as current")
        evaluation_status = "partial" if checkpoint_status in {"partial", "running"} else policy.success_status
        status_detail = policy.detail
        if checkpoint_status in {"partial", "running"}:
            status_detail = f"{policy.detail} Latest source collection is {checkpoint_status}."
        # A newly added target establishes its baseline at added_at: existing
        # history remains visible in the timeline but is not mislabeled as new.
        since = self._last_checked(target["id"], source_system) or target.get("added_at")
        if source_system in PROCUREMENT_SOURCES:
            rows = self._procurement_events(str(target["company_id"]), source_system, since)
            new_count = sum(
                self._insert_alert(target, row, procurement_alert_type(row["event_type"]), "procurement_event")
                for row in rows
            )
        elif source_system in PERMIT_SOURCES:
            rows = self._permit_events(str(target["company_id"]), source_system, since)
            new_count = sum(self._insert_alert(target, row, "permit_event", "permit") for row in rows)
        else:
            rows = self._movement_events(str(target["company_id"]), source_system, since)
            alert_type = "sec_filing" if source_system in SEC_SOURCES else "movement_event"
            new_count = sum(self._insert_alert(target, row, alert_type, "company_event") for row in rows)
        newest = max((row["event_date"] for row in rows if row.get("event_date")), default=None)
        self._update_source_state(
            target["id"], source_system, evaluation_status, status_detail, len(rows), new_count, newest,
        )
        return new_count

    def _latest_checkpoint_status(self, source_system: str) -> str | None:
        row = self.connection.execute(
            """SELECT status FROM source_checkpoints WHERE source_system=%s
               ORDER BY updated_at DESC LIMIT 1""",
            (source_system,),
        ).fetchone()
        return str(row["status"]) if row else None

    def _procurement_events(self, company_id: str, source_system: str, since: datetime | None) -> list[dict[str, Any]]:
        rows = [dict(row) for row in self.connection.execute(
            """WITH transaction_values AS (
                 SELECT t.*,
                        lag(t.current_total_value) OVER (
                          PARTITION BY t.award_id ORDER BY t.action_date NULLS LAST,t.created_at,t.id
                        ) AS prior_current_total_value
                 FROM transactions t WHERE NOT t.is_benchmark
               )
               SELECT e.id::text,e.event_type,e.event_at::date AS event_date,e.title,e.description AS summary,
               e.source_system,e.source_country AS market,e.source_url,'auto_verified' AS match_status,
               e.raw_source_id,e.award_id::text,e.currency,
               CASE WHEN e.event_type IN ('contract_modified','value_increased','value_decreased','option_exercised')
                    THEN COALESCE(e.value_delta_native,tx.obligation) END AS adjustment_delta,
               COALESCE(
                 NULLIF(abs(tx.prior_current_total_value),0),
                 NULLIF(abs(tx.current_total_value),0),
                 NULLIF(abs(a.current_value),0),
                 NULLIF(abs(a.potential_value),0),
                 NULLIF(abs(a.total_obligated),0)
               ) AS reference_award_value,
               COALESCE(e.evidence->>'modification_number',tx.modification_number) AS modification_number
               FROM procurement_events e
               LEFT JOIN transaction_values tx ON tx.source_transaction_id=e.raw_source_id AND tx.award_id=e.award_id
               LEFT JOIN awards a ON a.id=e.award_id
               WHERE e.company_id=%s AND e.source_system=%s
                 AND e.created_at > COALESCE(%s,now() - interval '30 days')
               ORDER BY e.event_at""",
            (company_id, source_system, since),
        ).fetchall()]
        return collapse_procurement_alert_events(rows)

    def _movement_events(self, company_id: str, source_system: str, since: datetime | None) -> list[dict[str, Any]]:
        return [dict(row) for row in self.connection.execute(
            """SELECT e.id::text,e.event_type,
               COALESCE(e.event_date,e.effective_start_date,e.announced_date) AS event_date,
               e.title,e.summary,e.source_system,e.source_country AS market,source.original_url AS source_url,
               ec.review_status AS match_status
               FROM company_event_companies ec JOIN company_events e ON e.id=ec.event_id
               JOIN LATERAL (
                 SELECT original_url,collected_at FROM company_event_sources WHERE event_id=e.id
                 ORDER BY is_primary DESC,collected_at DESC LIMIT 1
               ) source ON true
               WHERE ec.company_id=%s AND e.source_system=%s
                 AND ec.review_status IN ('auto_verified','approved')
                 AND source.collected_at > COALESCE(%s,now() - interval '30 days')
                 AND e.verification_status <> 'rejected'
               ORDER BY COALESCE(e.event_date,e.effective_start_date,e.announced_date)""",
            (company_id, source_system, since),
        ).fetchall()]

    def _permit_events(self, company_id: str, source_system: str, since: datetime | None) -> list[dict[str, Any]]:
        return [dict(row) for row in self.connection.execute(
            """SELECT p.id::text,p.relevance_classification AS event_type,
               COALESCE(p.issue_date,p.application_date) AS event_date,p.permit_number AS title,
               p.description AS summary,p.source_system,p.country_code AS market,p.source_url,r.review_status AS match_status
               FROM permit_company_relationships r JOIN development_permits p ON p.id=r.permit_id
               WHERE r.company_id=%s AND p.source_system=%s AND r.review_status IN ('auto_verified','approved')
                 AND p.last_observed_at > COALESCE(%s,now() - interval '30 days')
               ORDER BY COALESCE(p.issue_date,p.application_date)""",
            (company_id, source_system, since),
        ).fetchall()]

    def _insert_alert(self, target: dict[str, Any], row: dict[str, Any], alert_type: str, source_type: str) -> int:
        if not row.get("event_date"):
            return 0
        result = self.connection.execute(
            """INSERT INTO alert_events (
                 dedupe_key,company_id,monitor_target_id,alert_type,title,summary,event_date,market,
                 source_type,source_id,source_system,source_url,match_status
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (dedupe_key) DO NOTHING RETURNING id""",
            (
                monitor_alert_key(str(target["id"]), source_type, row["id"]),
                target["company_id"],
                target["id"],
                alert_type,
                row.get("title") or row["event_type"].replace("_", " ").title(),
                row.get("summary"),
                row["event_date"],
                row.get("market"),
                source_type,
                row["id"],
                row["source_system"],
                row["source_url"],
                row.get("match_status"),
            ),
        ).fetchone()
        return int(bool(result))

    def _upsert_discovery(self, row: Any, *, reason: str, source_type: str, match_status: str) -> int:
        status = "new" if match_status in {"auto_verified", "approved"} else "under_review"
        result = self.connection.execute(
            """INSERT INTO company_discoveries (
                 dedupe_key,company_id,observed_company_name,discovery_reason,source_system,source_type,
                 source_id,source_url,event_date,match_status,discovery_status,evidence
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
               ON CONFLICT (dedupe_key) DO UPDATE SET
                 source_url=EXCLUDED.source_url,event_date=EXCLUDED.event_date,
                 match_status=EXCLUDED.match_status,
                 discovery_status=CASE
                   WHEN company_discoveries.discovery_status IN ('tracked','dismissed')
                   THEN company_discoveries.discovery_status
                   ELSE EXCLUDED.discovery_status
                 END,
                 evidence=EXCLUDED.evidence,last_observed_at=now(),updated_at=now()
               WHERE company_discoveries.source_url IS DISTINCT FROM EXCLUDED.source_url
                  OR company_discoveries.event_date IS DISTINCT FROM EXCLUDED.event_date
                  OR company_discoveries.match_status IS DISTINCT FROM EXCLUDED.match_status
                  OR company_discoveries.evidence IS DISTINCT FROM EXCLUDED.evidence
               RETURNING (xmax=0) AS inserted""",
            (
                discovery_key(source_type, row["source_id"], row.get("company_id")),
                row.get("company_id"),
                row.get("canonical_name"),
                reason,
                row["source_system"],
                source_type,
                row["source_id"],
                row["source_url"],
                row.get("event_date"),
                match_status,
                status,
                json.dumps({
                    "event_type": row.get("event_type"),
                    "title": row.get("title"),
                    "matching_method": row.get("matching_method"),
                    "matching_confidence": str(row.get("matching_confidence")) if row.get("matching_confidence") is not None else None,
                    "source_evidence": row.get("evidence") or {},
                }, default=str),
            ),
        ).fetchone()
        return int(bool(result and result["inserted"]))

    def _has_verified_cik(self, company_id: str) -> bool:
        return bool(self.connection.execute(
            """SELECT 1 FROM entity_identifiers WHERE company_id=%s AND is_verified
               AND upper(identifier_system) IN ('CIK','SEC_CIK') LIMIT 1""",
            (company_id,),
        ).fetchone())

    def _last_checked(self, target_id: str, source_system: str) -> datetime | None:
        row = self.connection.execute(
            """SELECT last_checked_at FROM company_monitor_source_state
               WHERE company_monitor_target_id=%s AND source_system=%s""",
            (target_id, source_system),
        ).fetchone()
        return row["last_checked_at"] if row else None

    def _update_source_state(
        self,
        target_id: str,
        source_system: str,
        status: str,
        detail: str,
        seen: int,
        new_records: int,
        newest: Any,
    ) -> None:
        self.connection.execute(
            """INSERT INTO company_monitor_source_state (
                 company_monitor_target_id,source_system,last_checked_at,last_success_at,last_new_record_at,
                 status,status_detail,records_seen,new_records
               ) VALUES (%s,%s,now(),CASE WHEN %s IN ('healthy','partial') THEN now() ELSE NULL END,%s,%s,%s,%s,%s)
               ON CONFLICT (company_monitor_target_id,source_system) DO UPDATE SET
                 last_checked_at=now(),
                 last_success_at=CASE WHEN EXCLUDED.status IN ('healthy','partial') THEN now() ELSE company_monitor_source_state.last_success_at END,
                 last_new_record_at=COALESCE(EXCLUDED.last_new_record_at,company_monitor_source_state.last_new_record_at),
                 status=EXCLUDED.status,status_detail=EXCLUDED.status_detail,records_seen=EXCLUDED.records_seen,
                 new_records=EXCLUDED.new_records,last_error_at=NULL,last_error_message=NULL,updated_at=now()""",
            (target_id, source_system, status, newest, status, detail, seen, new_records),
        )

    def _audit_target(
        self,
        target_id: str,
        action: str,
        previous: dict[str, Any],
        new: dict[str, Any],
        actor: str,
    ) -> None:
        self.connection.execute(
            """INSERT INTO company_monitor_target_audit (
                 monitor_target_id,action,previous_values,new_values,acted_by
               ) VALUES (%s,%s,%s::jsonb,%s::jsonb,%s)""",
            (target_id, action, json.dumps(previous, default=str), json.dumps(new, default=str), actor),
        )


def source_family_summary(rows: Iterable[dict[str, Any]]) -> dict[str, int]:
    summary = {"healthy": 0, "partial": 0, "error": 0, "unsupported": 0, "not_applicable": 0}
    for row in rows:
        status = str(row.get("status") or "unsupported")
        if status in summary:
            summary[status] += 1
    return summary
