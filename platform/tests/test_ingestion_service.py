from datetime import date, datetime, timezone

from ingestion.service import IngestionService


RAW = {
    "internal_id": "tx-100",
    "generated_internal_id": "CONT_AWD_DEMO",
    "Award ID": "DEMO-1",
    "Recipient Name": "Example Federal Systems LLC",
    "Recipient UEI": "EXAMPLEUEI01",
    "Recipient Location": {"city_name": "Reston", "state_code": "VA", "county_code": "059"},
    "Primary Place of Performance": {"city_name": "Rockville", "state_code": "MD", "county_code": "031"},
    "Action Date": "2026-10-10",
    "Transaction Amount": "1000",
    "Transaction Description": "Cybersecurity support",
    "PSC": "D310",
}


class FakeClient:
    def __init__(self, rows): self.rows = rows; self.calls = []
    def iter_transactions(self, start, end, date_type): self.calls.append((start,end,date_type)); yield from self.rows


class MemoryRepository:
    def __init__(self): self.transactions = {}; self.awards = {}; self.runs = []; self.checkpoint = datetime(2026,10,10,tzinfo=timezone.utc)
    def last_successful_checkpoint(self, source): return self.checkpoint
    def start_run(self, source, start, end): self.runs.append({"source":source,"start":start,"end":end}); return "run-1"
    def ingest(self, record):
        award_id=record["award"]["generated_award_id"]; inserted=award_id not in self.awards
        self.awards[award_id]=record["award"]; self.transactions[record["transaction"]["source_transaction_id"]]=record["transaction"]
        return inserted
    def finish_run(self, run_id, status, stats, error_summary=None): self.runs[-1].update(status=status,stats=stats,error=error_summary)


def test_award_and_transaction_upserts_are_idempotent():
    repository=MemoryRepository(); client=FakeClient([RAW]); service=IngestionService(repository,client,overlap_days=3)
    first=service.sync(today=date(2026,10,12)); second=service.sync(today=date(2026,10,12))
    assert first["inserted"] == 1 and second["updated"] == 1
    assert len(repository.awards) == 1
    assert len(repository.transactions) == 1
    assert client.calls[0] == (date(2026,10,7),date(2026,10,12),"last_modified_date")


def test_search_endpoint_award_internal_id_does_not_collapse_modifications():
    from ingestion.normalize import normalize_transaction
    first=normalize_transaction({**RAW,"internal_id":"award-surrogate","Mod":"P00001"},datetime.now(timezone.utc))
    second=normalize_transaction({**RAW,"internal_id":"award-surrogate","Mod":"P00002"},datetime.now(timezone.utc))
    assert first["transaction"]["source_transaction_id"] != second["transaction"]["source_transaction_id"]
    assert first["transaction"]["source_transaction_id"].startswith("search-derived-")


def test_reconciliation_uses_action_date_window():
    repository=MemoryRepository(); client=FakeClient([])
    result=IngestionService(repository,client).reconcile(30,today=date(2026,10,12))
    assert result["date_type"] == "action_date"
    assert client.calls[0][0] == date(2026,9,12)


def test_reconciliation_accepts_an_explicit_historical_window():
    repository=MemoryRepository(); client=FakeClient([])
    result=IngestionService(repository,client).reconcile_window(date(2022,1,2),date(2022,1,2))
    assert result["start"] == "2022-01-02" and result["end"] == "2022-01-02"
    assert client.calls[0] == (date(2022,1,2),date(2022,1,2),"action_date")


def test_service_commits_configured_batches_and_reports_entity_counts():
    class BatchRepository(MemoryRepository):
        def __init__(self):
            super().__init__(); self.batch_sizes=[]
        def ingest_batch(self, records):
            self.batch_sizes.append(len(records))
            inserted=sum(self.ingest(record) for record in records)
            return {
                "records_inserted": inserted, "records_updated": len(records)-inserted,
                "companies_created": inserted, "awards_created": inserted,
                "transactions_created": inserted, "batches_committed": 1,
            }
    rows=[]
    for index in range(5):
        row={**RAW,"internal_id":f"tx-{index}","generated_internal_id":f"award-{index}","Award ID":f"PIID-{index}"}
        rows.append(row)
    repository=BatchRepository()
    result=IngestionService(repository,FakeClient(rows),batch_size=2).reconcile(3,today=date(2026,10,12))
    assert repository.batch_sizes == [2,2,1]
    assert result["batches_committed"] == 3
    assert result["transactions_created"] == 5


def test_transient_batch_failure_retries_the_whole_batch_before_row_isolation():
    class TransientBatchRepository(MemoryRepository):
        def __init__(self):
            super().__init__()
            self.calls = 0

        def ingest_batch(self, records):
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("connection dropped")
            inserted = sum(self.ingest(record) for record in records)
            return {
                "records_inserted": inserted,
                "records_updated": len(records) - inserted,
                "companies_created": inserted,
                "awards_created": inserted,
                "transactions_created": inserted,
                "batches_committed": 1,
            }

    repository = TransientBatchRepository()
    result = IngestionService(repository, FakeClient([RAW]), batch_size=10).reconcile(
        3, today=date(2026, 10, 12)
    )

    assert repository.calls == 2
    assert result["status"] == "success"
    assert result["failed"] == 0
    assert result["transactions_created"] == 1


def test_source_failure_marks_run_failed_without_advancing_success_checkpoint():
    class FailingClient:
        def iter_transactions(self, start, end, date_type):
            yield RAW
            raise RuntimeError("upstream unavailable")

    repository = MemoryRepository()
    original_checkpoint = repository.checkpoint
    service = IngestionService(repository, FailingClient(), batch_size=10)

    import pytest

    with pytest.raises(RuntimeError, match="upstream unavailable"):
        service.sync(today=date(2026, 10, 12))

    assert repository.runs[-1]["status"] == "failed"
    assert repository.checkpoint == original_checkpoint
    assert repository.transactions == {}


def test_isolated_record_failure_marks_run_partial_and_keeps_good_records():
    class PartiallyFailingRepository(MemoryRepository):
        def ingest(self, record):
            if record["award"]["piid"] == "BAD-PIID":
                raise ValueError("malformed record")
            return super().ingest(record)

    bad = {
        **RAW,
        "internal_id": "tx-bad",
        "generated_internal_id": "award-bad",
        "Award ID": "BAD-PIID",
    }
    repository = PartiallyFailingRepository()
    result = IngestionService(repository, FakeClient([RAW, bad]), batch_size=2).reconcile(
        3, today=date(2026, 10, 12)
    )

    assert result["status"] == "partial"
    assert result["inserted"] == 1
    assert result["failed"] == 1
    assert repository.runs[-1]["status"] == "partial"
    assert len(repository.transactions) == 1
    assert repository.awards["CONT_AWD_DEMO"]["piid"] == "DEMO-1"
