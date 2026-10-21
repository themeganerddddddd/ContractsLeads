from __future__ import annotations

from datetime import datetime, timezone

from ingestion.adapters import SourceEnvelope
from ingestion.uk.adapter import FindATenderAdapter
from ingestion.uk.service import UKSyncService


RELEASE = {
    "ocid": "ocds-h6vhtk-example",
    "id": "012345-2026",
    "tag": ["award", "contract"],
    "date": "2026-04-12T12:00:00Z",
    "buyer": {"id": "GB-PPON-AAAA-BBBB-CCCC", "name": "Example Council"},
    "parties": [
        {
            "id": "GB-PPON-AAAA-BBBB-CCCC", "name": "Example Council", "roles": ["buyer"],
            "identifier": {"scheme": "GB-PPON", "id": "AAAA-BBBB-CCCC"},
            "address": {"locality": "London", "country": "GB"},
        },
        {
            "id": "GB-COH-01234567", "name": "Example Supplier Ltd", "roles": ["supplier"],
            "identifier": {"scheme": "GB-COH", "id": "01234567"},
            "address": {"locality": "Manchester", "postalCode": "M1 1AA", "country": "GB"},
        },
    ],
    "tender": {
        "title": "Cloud support", "description": "Managed cloud service", "status": "complete",
        "items": [{"additionalClassifications": [{"scheme": "CPV", "id": "72000000"}], "deliveryAddresses": [{"region": "UKI", "country": "GB"}]}],
        "tenderPeriod": {"endDate": "2026-02-01T12:00:00Z"},
    },
    "awards": [{
        "id": "award-1", "date": "2026-03-01T00:00:00Z",
        "value": {"amount": 125000, "currency": "GBP"},
        "suppliers": [{"id": "GB-COH-01234567", "name": "Example Supplier Ltd"}],
    }],
    "contracts": [{"id": "contract-1", "period": {"startDate": "2026-04-01T00:00:00Z", "endDate": "2027-03-31T23:59:59Z"}}],
}


def envelope():
    return SourceEnvelope(
        "uk_find_a_tender", RELEASE["id"], "https://www.find-tender.service.gov.uk/Notice/012345-2026",
        datetime(2026, 4, 12, tzinfo=timezone.utc), RELEASE,
    )


def test_uk_ocds_normalization_preserves_lifecycle_identifiers_cpv_and_gbp():
    normalized = FindATenderAdapter().normalize(envelope())
    assert normalized["source_process_id"] == RELEASE["ocid"]
    assert normalized["value_native"] == 125000
    assert normalized["currency"] == "GBP"
    assert normalized["value_usd"] is None and normalized["fx_rate"] is None
    assert normalized["native_category_code"] == "72000000"
    assert normalized["suppliers"][0]["identifiers"] == [{"scheme": "GB-COH", "id": "01234567"}]
    assert {event["event_type"] for event in normalized["events"]} == {"award_announced", "contract_signed"}
    assert normalized["contract_start_date"].isoformat() == "2026-04-01"


def test_uk_event_fingerprints_are_stable_across_retries():
    adapter = FindATenderAdapter()
    first = adapter.normalize(envelope())
    second = adapter.normalize(envelope())
    assert [event["event_fingerprint"] for event in first["events"]] == [event["event_fingerprint"] for event in second["events"]]
    assert first["payload_hash"] == second["payload_hash"]


def test_uk_sync_reports_release_deduplication_without_aborting():
    class Adapter(FindATenderAdapter):
        def fetch(self, window, *, limit=None):
            yield envelope()
            yield envelope()

    class Repository:
        def __init__(self): self.seen = set(); self.finished = None
        def start_source_sync(self, source, key): self.started = (source, key)
        def ingest_global_release(self, record):
            key = (record["source_release_id"], record["payload_hash"])
            inserted = key not in self.seen
            self.seen.add(key)
            return inserted
        def finish_source_sync(self, source, key, status, stats, **kwargs): self.finished = (status, stats)

    repository = Repository()
    stats = UKSyncService(repository, Adapter()).sync(
        datetime(2026, 4, 1, tzinfo=timezone.utc), datetime(2026, 4, 30, tzinfo=timezone.utc)
    )
    assert stats == {"status": "success", "source": "uk_find_a_tender", "received": 2, "written": 1, "duplicates": 1, "failed": 0}
    assert repository.finished[0] == "success"
