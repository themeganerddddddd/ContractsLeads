from pathlib import Path
from datetime import date
import re

from movements.tracking import (
    ALL_MONITOR_SOURCES,
    CompanyTrackingService,
    SOURCE_POLICIES,
    discovery_key,
    monitor_alert_key,
    procurement_alert_type,
    saved_search_alert_key,
    saved_search_matches,
    source_family_summary,
)


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "db"
    / "migrations"
    / "0013_company_tracking_product.sql"
).read_text(encoding="utf-8")


def test_platform_tracking_registry_is_distinct_from_user_watches():
    assert "CREATE TABLE IF NOT EXISTS company_monitor_targets" in MIGRATION
    assert "UNIQUE (company_id)" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS company_watches" not in MIGRATION
    assert "ALTER TABLE company_watches" not in MIGRATION
    assert "user_id" not in MIGRATION.split("CREATE TABLE IF NOT EXISTS company_monitor_targets", 1)[1].split(");", 1)[0]


def test_tracking_schema_preserves_state_history_and_deduplicates_alerts():
    assert "CREATE TABLE IF NOT EXISTS company_monitor_source_state" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS company_monitor_target_audit" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS alert_events" in MIGRATION
    assert "dedupe_key text NOT NULL UNIQUE" in MIGRATION
    assert "delivered_at timestamptz" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS company_match_review_actions" in MIGRATION


def test_tracking_migration_is_additive_and_does_not_rewrite_procurement_history():
    assert not re.search(r"\b(?:DROP|TRUNCATE)\s+TABLE\b", MIGRATION, re.IGNORECASE)
    assert not re.search(r"\bDELETE\s+FROM\b", MIGRATION, re.IGNORECASE)
    assert not re.search(r"\bUPDATE\s+(?:companies|awards|transactions|procurement_\w+)\b", MIGRATION, re.IGNORECASE)


def test_procurement_alert_classification_never_labels_contracts_as_movement():
    assert procurement_alert_type("award_announced") == "new_award"
    assert procurement_alert_type("contract_modified") == "contract_modified"
    assert procurement_alert_type("value_increased") == "contract_modified"
    assert procurement_alert_type("contract_completed") == "procurement_event"
    assert "expansion" not in {procurement_alert_type(value) for value in ("award_announced", "contract_modified")}


def test_alert_and_discovery_keys_are_deterministic_and_entity_specific():
    assert monitor_alert_key("target-1", "procurement_event", "event-1") == monitor_alert_key(
        "target-1", "procurement_event", "event-1"
    )
    assert monitor_alert_key("target-1", "procurement_event", "event-1") != monitor_alert_key(
        "target-2", "procurement_event", "event-1"
    )
    assert discovery_key("company_event", "event-1", "company-a") != discovery_key(
        "company_event", "event-1", "company-b"
    )


def test_discovery_key_does_not_duplicate_an_event_when_review_status_changes():
    assert discovery_key("company_event", "event-1", "company-a") == discovery_key(
        "company_event", "event-1", "company-a"
    )


def test_procurement_monitor_uses_ingestion_time_for_new_since_last_check():
    source = Path(__file__).resolve().parents[1] / "movements" / "tracking.py"
    implementation = source.read_text(encoding="utf-8")
    query = implementation.split("def _procurement_events", 1)[1].split("def _movement_events", 1)[0]
    assert "created_at > COALESCE" in query
    assert "event_at > COALESCE" not in query


def test_supported_source_matrix_is_explicit_and_reports_gaps():
    assert set(ALL_MONITOR_SOURCES) == {
        "usaspending",
        "uk_find_a_tender",
        "eu_ted",
        "maryland_warn",
        "virginia_warn",
        "maryland_commerce_press",
        "montgomery_county_commercial_permits",
        "sec_edgar_submissions",
    }
    assert source_family_summary([
        {"status": "healthy"}, {"status": "partial"}, {"status": "unsupported"}, {"status": "not_applicable"}
    ]) == {"healthy": 1, "partial": 1, "error": 0, "unsupported": 1, "not_applicable": 1}


def test_schema_entry_point_includes_tracking_migration():
    schema = (Path(__file__).resolve().parents[1] / "db" / "schema.sql").read_text(encoding="utf-8")
    assert "0013_company_tracking_product.sql" in schema


def test_manual_company_intelligence_workflow_evaluates_targets_without_enabling_email_or_schedule():
    workflow = (
        Path(__file__).resolve().parents[2]
        / ".github"
        / "workflows"
        / "platform-company-movements.yml"
    ).read_text(encoding="utf-8")
    assert "workflow_dispatch:" in workflow
    assert "schedule:" not in workflow
    assert "monitor-tracked" in workflow
    assert 'ALERT_EMAIL_ENABLED: "false"' in workflow


class _FakeConnection:
    def __init__(self):
        self.commits = 0
        self.rollbacks = 0
        self.error_updates = []

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def execute(self, sql, values=()):
        self.error_updates.append((sql, values))
        return self


class _SourceIsolationService(CompanyTrackingService):
    def _evaluate_source(self, target, source_system, policy):
        if source_system == "virginia_warn":
            raise RuntimeError("source-specific failure")
        return 1


def test_one_monitor_source_failure_does_not_stop_other_source_families():
    connection = _FakeConnection()
    service = _SourceIsolationService(connection)
    target = {"id": "target-1", "company_id": "company-1"}
    result = service._evaluate_target(target)
    assert result["alerts_inserted"] == len(SOURCE_POLICIES) - 1
    assert result["source_failures"] == [
        {
            "company_id": "company-1",
            "source_system": "virginia_warn",
            "error": "RuntimeError: source-specific failure",
        }
    ]
    assert connection.rollbacks == 1
    assert connection.commits == len(SOURCE_POLICIES)


class _Result:
    def __init__(self, row):
        self.row = row

    def fetchone(self):
        return self.row


class _TrackingConnection:
    def __init__(self):
        self.target = None
        self.actions = []
        self.commits = 0

    def commit(self):
        self.commits += 1

    def execute(self, sql, values=()):
        normalized = " ".join(sql.split())
        if "FROM companies WHERE id=%s" in normalized:
            return _Result({"id": values[0], "canonical_name": "Example", "legal_name": "Example LLC", "uei": "UEI1", "cage_code": "CAGE1"})
        if normalized.startswith("SELECT * FROM company_monitor_targets"):
            return _Result(dict(self.target) if self.target else None)
        if normalized.startswith("INSERT INTO company_monitor_targets"):
            self.target = {
                "id": "target-1", "company_id": values[0], "tracking_status": "active",
                "tracking_reason": values[1], "priority": values[2],
                "monitor_procurement": values[5], "monitor_movements": values[6],
                "monitor_permits": values[7], "monitor_sec": values[8],
                "monitor_hiring": False, "monitor_property": False,
                "created_at": "2026-10-24T00:00:00Z", "updated_at": "2026-10-24T00:00:00Z",
            }
            return _Result(dict(self.target))
        if normalized.startswith("UPDATE company_monitor_targets SET"):
            keys = [
                "tracking_status", "priority", "notes", "monitor_procurement", "monitor_movements",
                "monitor_permits", "monitor_sec", "monitor_hiring", "monitor_property",
            ]
            for key, value in zip(keys, values[:-1]):
                if value is not None:
                    self.target[key] = value
            return _Result(dict(self.target))
        if normalized.startswith("INSERT INTO company_monitor_target_audit"):
            self.actions.append(values[1])
            return _Result(None)
        if normalized.startswith("SELECT 1 FROM entity_identifiers"):
            return _Result(None)
        return _Result(None)


def test_monitor_target_lifecycle_is_idempotent_audited_and_preserves_history():
    connection = _TrackingConnection()
    service = CompanyTrackingService(connection)
    created = service.add_target("company-1", priority="high", actor="analyst")
    reactivated = service.add_target("company-1", priority="normal", actor="analyst")
    paused = service.update_target("company-1", actor="analyst", status="paused")
    resumed = service.update_target(
        "company-1", actor="analyst", status="active", priority="low",
        source_flags={"monitor_sec": False},
    )
    archived = service.update_target("company-1", actor="analyst", status="archived")
    assert created["id"] == reactivated["id"] == "target-1"
    assert paused["tracking_status"] == "paused"
    assert resumed["tracking_status"] == "active"
    assert resumed["priority"] == "low"
    assert resumed["monitor_sec"] is False
    assert archived["tracking_status"] == "archived"
    assert connection.actions == ["created", "activated", "paused", "activated", "archived"]


class _AlertConnection:
    def __init__(self):
        self.keys = set()
        self.alert_types = []

    def execute(self, sql, values=()):
        assert "INSERT INTO alert_events" in sql
        key = values[0]
        self.alert_types.append(values[4] if "saved_search_id" in sql else values[3])
        if key in self.keys:
            return _Result(None)
        self.keys.add(key)
        return _Result({"id": f"alert-{len(self.keys)}"})


def test_company_alert_types_persist_once_per_real_source_event():
    connection = _AlertConnection()
    service = CompanyTrackingService(connection)
    target = {"id": "target-1", "company_id": "company-1"}
    base = {
        "event_date": date(2026, 10, 24),
        "summary": "Official source evidence",
        "market": "US",
        "match_status": "auto_verified",
        "source_url": "https://example.gov/official-record",
    }
    cases = [
        ({**base, "id": "award-1", "event_type": "award_announced", "title": "Award", "source_system": "usaspending"}, "new_award", "procurement_event"),
        ({**base, "id": "mod-1", "event_type": "contract_modified", "title": "Modification", "source_system": "usaspending"}, "contract_modified", "procurement_event"),
        ({**base, "id": "movement-1", "event_type": "layoff", "title": "WARN", "source_system": "virginia_warn"}, "movement_event", "company_event"),
        ({**base, "id": "permit-1", "event_type": "commercial_new_construction", "title": "Permit", "source_system": "montgomery_county_commercial_permits"}, "permit_event", "permit"),
        ({**base, "id": "sec-1", "event_type": "sec_8k", "title": "8-K", "source_system": "sec_edgar_submissions"}, "sec_filing", "company_event"),
    ]
    for row, alert_type, source_type in cases:
        assert service._insert_alert(target, row, alert_type, source_type) == 1
        assert service._insert_alert(target, row, alert_type, source_type) == 0
    assert connection.alert_types[::2] == [case[1] for case in cases]


def test_pending_movement_and_unreviewed_permit_cannot_generate_alerts():
    implementation = (Path(__file__).resolve().parents[1] / "movements" / "tracking.py").read_text(encoding="utf-8")
    movement_query = implementation.split("def _movement_events", 1)[1].split("def _permit_events", 1)[0]
    permit_query = implementation.split("def _permit_events", 1)[1].split("def _insert_alert", 1)[0]
    assert "ec.review_status IN ('auto_verified','approved')" in movement_query
    assert "r.review_status IN ('auto_verified','approved')" in permit_query


def test_saved_search_matching_keeps_company_and_activity_geography_separate():
    row = {
        "recipient_state": "MD",
        "recipient_county": "Montgomery County",
        "activity_state": "VA",
        "activity_county": "Fairfax County",
        "industry_slug": "professional-services",
        "agency": "Department of Defense",
        "market": "US_FEDERAL",
        "source_type": "procurement_event",
        "source_system": "usaspending",
        "event_type": "award_announced",
        "event_date": date(2026, 10, 24),
        "canonical_name": "Example Company",
        "title": "Example award",
    }
    assert saved_search_matches({"recipientState": "MD", "performanceState": "VA"}, row)
    assert not saved_search_matches({"recipientState": "VA"}, row)
    assert not saved_search_matches({"performanceState": "MD"}, row)
    assert saved_search_matches({"signal_type": "contracts", "market": "US_FEDERAL"}, row)


def test_saved_search_alert_keys_are_deduplicated_by_search_and_source_event():
    key = saved_search_alert_key("search-1", "procurement_event", "event-1", "company-1")
    assert key == saved_search_alert_key("search-1", "procurement_event", "event-1", "company-1")
    assert key != saved_search_alert_key("search-2", "procurement_event", "event-1", "company-1")


def test_region_saved_search_alert_is_persisted_once_and_remains_user_owned():
    connection = _AlertConnection()
    service = CompanyTrackingService(connection)
    search = {
        "id": "search-1", "user_id": "user-1", "name": "Virginia activity",
        "query_json": {"performanceState": "VA"},
    }
    row = {
        "company_id": "company-1", "canonical_name": "Example Company",
        "discovery_reason": "new_award", "source_system": "usaspending",
        "source_type": "procurement_event", "source_id": "event-1",
        "source_url": "https://example.gov/official-record", "event_date": date(2026, 10, 24),
        "match_status": "auto_verified", "market": "US_FEDERAL", "title": "New award",
    }
    assert service._insert_saved_search_alert(search, row) == 1
    assert service._insert_saved_search_alert(search, row) == 0
    assert connection.alert_types == ["region_event", "region_event"]
