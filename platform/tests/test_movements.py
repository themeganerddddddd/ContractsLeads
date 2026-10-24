from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

from movements.maryland import MarylandCommerceAdapter, MarylandWarnAdapter
from movements.matching import match_company_name
from movements.models import MovementEnvelope
from movements.service import MovementIngestionService
from movements.virginia import VirginiaWarnAdapter


FIXTURES = Path(__file__).parent / "fixtures"
OBSERVED = datetime(2026, 10, 23, tzinfo=timezone.utc)


def test_maryland_warn_parser_preserves_official_fields_and_source_url():
    html = (FIXTURES / "maryland_warn_sample.html").read_text(encoding="utf-8")
    rows = MarylandWarnAdapter.parse_html(html, observed_at=OBSERVED)
    assert len(rows) == 2
    first = MarylandWarnAdapter().normalize(rows[0])
    assert first.observed_company_name == "True Food Kitchen"
    assert first.event["event_type"] == "closure"
    assert first.event["jobs_affected"] == 41
    assert first.event["employment_change"] == -41
    assert first.event["effective_start_date"] == date(2026, 12, 4)
    assert first.event["primary_county_fips"] == "24031"
    assert first.source["original_url"].endswith("/employment/warn.shtml")
    assert first.source["commercial_use_status"] == "unverified"
    assert first.location["location_role"] == "affected_worksite"


def test_maryland_warn_rescission_is_status_not_a_new_company_name():
    html = (FIXTURES / "maryland_warn_sample.html").read_text(encoding="utf-8")
    rows = MarylandWarnAdapter.parse_html(html, observed_at=OBSERVED)
    movement = MarylandWarnAdapter().normalize(rows[1])
    assert movement.observed_company_name == "Advanced Packaging, Inc."
    assert movement.event["event_status"] == "rescinded"
    assert movement.event["primary_county_fips"] == "24510"


def test_virginia_warn_parser_retains_direct_notice_and_does_not_promote_company_address():
    html = (FIXTURES / "virginia_warn_sample.html").read_text(encoding="utf-8")
    rows = VirginiaWarnAdapter.parse_html(html, observed_at=OBSERVED)
    assert len(rows) == 2
    movement = VirginiaWarnAdapter().normalize(rows[0])
    assert movement.observed_company_name == "ICF International LLC"
    assert movement.event["event_type"] == "layoff"
    assert movement.event["jobs_affected"] == 82
    assert movement.event["effective_start_date"] == date(2026, 12, 7)
    assert movement.event["primary_city"] == "Arlington"
    assert movement.event["primary_county_fips"] is None
    assert movement.source["original_url"].endswith("/wp-content/uploads/2026/10/icf.pdf")
    assert movement.source["raw_payload"]["listing_url"].endswith("/warn-notices/")
    assert movement.source["raw_payload"]["company_address"].endswith("Arlington, VA 22201")
    assert movement.location["address_line"] is None
    assert movement.location["location_role"] == "affected_worksite"


def test_virginia_warn_closure_and_date_range_are_preserved():
    html = (FIXTURES / "virginia_warn_sample.html").read_text(encoding="utf-8")
    movement = VirginiaWarnAdapter().normalize(VirginiaWarnAdapter.parse_html(html, observed_at=OBSERVED)[1])
    assert movement.event["event_type"] == "closure"
    assert movement.event["effective_start_date"] == date(2026, 11, 16)
    assert movement.event["effective_end_date"] == date(2026, 12, 15)
    assert movement.event["employment_change"] == -200


def test_virginia_warn_correction_is_a_source_revision_of_the_same_event():
    html = (FIXTURES / "virginia_warn_sample.html").read_text(encoding="utf-8")
    corrected = html.replace("<td>82</td>", "<td>84</td>", 1)
    original = VirginiaWarnAdapter().normalize(VirginiaWarnAdapter.parse_html(html, observed_at=OBSERVED, limit=1)[0])
    revision = VirginiaWarnAdapter().normalize(VirginiaWarnAdapter.parse_html(corrected, observed_at=OBSERVED, limit=1)[0])
    assert original.event["event_fingerprint"] == revision.event["event_fingerprint"]
    assert original.source["source_record_fingerprint"] != revision.source["source_record_fingerprint"]
    assert revision.event["jobs_affected"] == 84


def test_commerce_parser_only_selects_expansion_releases_and_extracts_announced_claims():
    listing_html = (FIXTURES / "maryland_commerce_listing_sample.html").read_text(encoding="utf-8")
    detail_html = (FIXTURES / "maryland_commerce_detail_sample.html").read_text(encoding="utf-8")
    listings = MarylandCommerceAdapter.parse_listing_html(listing_html)
    assert len(listings) == 1
    payload = MarylandCommerceAdapter.parse_detail_html(detail_html, listings[0])
    envelope = MovementEnvelope(
        source_system="maryland_commerce_press",
        document_identifier="md-commerce-test",
        source_url=payload["url"],
        publisher="Maryland Department of Commerce",
        publication_date=date(2026, 8, 12),
        observed_at=OBSERVED,
        source_type="official_economic_development_announcement",
        payload=payload,
    )
    movement = MarylandCommerceAdapter().normalize(envelope)
    assert movement.observed_company_name == "Cloudforce"
    assert movement.event["event_type"] == "facility_expansion"
    assert movement.location["location_role"] == "expanded_facility"
    assert movement.event["event_status"] == "announced"
    assert movement.event["jobs_created"] == 250
    assert str(movement.event["capital_investment"]) == "12000000"
    assert movement.event["currency"] == "USD"
    assert movement.event["primary_county_fips"] == "24033"
    assert movement.event["evidence"]["numeric_claims_are_announced"] is True


def test_company_background_headquarters_reference_does_not_become_a_headquarters_move():
    envelope = MovementEnvelope(
        source_system="maryland_commerce_press",
        document_identifier="md-commerce-expansion",
        source_url="https://commerce.maryland.gov/press-room/example-expansion",
        publisher="Maryland Department of Commerce",
        publication_date=date(2026, 9, 15),
        observed_at=OBSERVED,
        source_type="official_economic_development_announcement",
        payload={
            "title": "Governor Announces Example Foods Expansion with 140 New Jobs",
            "summary": "The company, headquartered in Baltimore, will expand operations in Anne Arundel County.",
            "body_excerpt": "Example Foods plans to create 140 new jobs through the announced expansion.",
            "company_name": "Example Foods",
        },
    )
    movement = MarylandCommerceAdapter().normalize(envelope)
    assert movement.event["event_type"] == "expansion"
    assert movement.location["location_role"] == "destination"


def test_company_matching_auto_links_only_one_exact_normalized_name():
    rows = [
        {"id": "1", "canonical_name": "Cloudforce Group, Inc.", "legal_name": "Cloudforce Group, Inc."},
        {"id": "2", "canonical_name": "Cloud Force Consulting", "legal_name": "Cloud Force Consulting LLC"},
    ]
    match = match_company_name("Cloudforce Group", rows)
    assert match.status == "matched"
    assert match.company["id"] == "1"
    fuzzy = match_company_name("Cloudforce", rows)
    assert fuzzy.company is None
    assert fuzzy.status in {"ambiguous", "unmatched"}


def test_same_name_entities_and_shared_parents_remain_ambiguous():
    rows = [
        {"id": "subsidiary-a", "canonical_name": "Acme Services LLC", "legal_name": "Acme Services LLC", "parent_company_id": "parent"},
        {"id": "subsidiary-b", "canonical_name": "Acme Services Inc.", "legal_name": "Acme Services Inc.", "parent_company_id": "parent"},
    ]
    match = match_company_name("Acme Services", rows)
    assert match.status == "ambiguous"
    assert match.company is None
    assert {candidate["id"] for candidate in match.candidates} == {"subsidiary-a", "subsidiary-b"}


def test_warn_revision_keeps_event_identity_but_changes_source_revision_hash():
    html = (FIXTURES / "maryland_warn_sample.html").read_text(encoding="utf-8")
    corrected = html.replace("<td>41</td>", "<td>44</td>", 1)
    original_row = MarylandWarnAdapter.parse_html(html, observed_at=OBSERVED, limit=1)[0]
    corrected_row = MarylandWarnAdapter.parse_html(corrected, observed_at=OBSERVED, limit=1)[0]
    original = MarylandWarnAdapter().normalize(original_row)
    revision = MarylandWarnAdapter().normalize(corrected_row)
    assert original.event["event_fingerprint"] == revision.event["event_fingerprint"]
    assert original.source["source_record_fingerprint"] != revision.source["source_record_fingerprint"]
    assert revision.event["jobs_affected"] == 44


def test_invalid_warn_dates_are_not_fabricated_into_events():
    html = """<table><tr><th>Date</th></tr><tr><td>not-a-date</td><td>1</td><td>Example</td><td>Address</td><td>Area</td><td>12</td><td>unknown</td><td>Layoff</td></tr></table>"""
    assert MarylandWarnAdapter.parse_html(html, observed_at=OBSERVED) == []


class FakeRepository:
    def __init__(self):
        self.started = []
        self.finished = []
        self.persisted = []

    def start_source_sync(self, source_system, checkpoint_key):
        self.started.append((source_system, checkpoint_key))

    def finish_source_sync(self, source_system, checkpoint_key, status, stats, **kwargs):
        self.finished.append((source_system, status, stats, kwargs))

    def company_candidates(self, observed_name):
        return []

    def persist(self, movement, match):
        self.persisted.append((movement, match))


class FakeAdapter:
    def __init__(self, name, envelopes=(), fail_fetch=False, fail_document=None):
        self.source_system = name
        self.envelopes = list(envelopes)
        self.fail_fetch = fail_fetch
        self.fail_document = fail_document

    def fetch(self, *, limit=None):
        if self.fail_fetch:
            raise RuntimeError("source unavailable")
        return iter(self.envelopes[:limit])

    def normalize(self, envelope):
        if envelope.document_identifier == self.fail_document:
            raise ValueError("bad record")
        html = (FIXTURES / "maryland_warn_sample.html").read_text(encoding="utf-8")
        return MarylandWarnAdapter().normalize(MarylandWarnAdapter.parse_html(html, observed_at=OBSERVED, limit=1)[0])

    def checkpoint(self, envelope):
        return envelope.document_identifier


def _envelope(identifier):
    return MovementEnvelope("test", identifier, "https://example.gov", "Agency", None, OBSERVED, "test", {})


def test_one_bad_record_does_not_stop_the_source_batch():
    repository = FakeRepository()
    adapter = FakeAdapter("test", [_envelope("bad"), _envelope("good")], fail_document="bad")
    result = MovementIngestionService(repository).sync(adapter)
    assert result["status"] == "partial"
    assert result["failed"] == 1
    assert result["written"] == 1
    assert len(repository.persisted) == 1


def test_one_failed_collector_does_not_stop_other_collectors():
    repository = FakeRepository()
    result = MovementIngestionService(repository).sync_all([
        FakeAdapter("down", fail_fetch=True),
        FakeAdapter("up", [_envelope("good")]),
    ])
    assert result["status"] == "partial"
    assert result["sources_failed"] == 1
    assert result["sources"][1]["written"] == 1
