from __future__ import annotations

import csv
from datetime import date
from pathlib import Path

from ingestion.backfill import BackfillRunner, USAspendingArchiveClient, archive_row_to_source, fiscal_years


HEADERS = [
    "contract_transaction_unique_key", "contract_award_unique_key", "award_id_piid", "recipient_name",
    "recipient_uei", "action_date", "federal_action_obligation", "recipient_state_code",
    "recipient_county_fips_code", "primary_place_of_performance_state_code",
    "primary_place_of_performance_county_fips_code", "transaction_description", "naics_code",
]


def write_csv(path: Path, reject_at: int | None = None) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=HEADERS)
        writer.writeheader()
        for index, action_date in enumerate(("2022-01-01", "2022-01-02", "2022-01-03"), start=1):
            writer.writerow({
                "contract_transaction_unique_key": f"tx-{index}", "contract_award_unique_key": f"award-{index}",
                "award_id_piid": f"PIID-{index}", "recipient_name": f"Company {index}", "recipient_uei": f"UEI{index}",
                "action_date": action_date, "federal_action_obligation": str(index * 100), "recipient_state_code": "MD",
                "recipient_county_fips_code": "24031", "primary_place_of_performance_state_code": "VA",
                "primary_place_of_performance_county_fips_code": "51059",
                "transaction_description": "reject this row" if index == reject_at else "software support",
                "naics_code": "541512",
            })


class FakeRepository:
    def __init__(self):
        self.job = None
        self.transactions = set()

    def create_or_resume_backfill_job(self, **kwargs):
        if self.job is None:
            self.job = {
                "id": "job-1", "status": "queued", "current_member": None, "member_row": 0, "rows_processed": 0,
                "rows_in_window": 0, "batches_committed": 0, "records_inserted": 0, "records_updated": 0,
                "records_skipped": 0, "records_failed": 0, "companies_created": 0, "awards_created": 0,
                "transactions_created": 0,
            }
        return dict(self.job)

    def update_backfill_download(self, job_id, **kwargs):
        self.job["status"] = kwargs.get("status", self.job["status"])

    def ingest_batch(self, records, *, backfill_job_id, checkpoint):
        inserted = 0
        for record in records:
            transaction_id = record["transaction"]["source_transaction_id"]
            inserted += transaction_id not in self.transactions
            self.transactions.add(transaction_id)
        self.job.update(
            status="importing", current_member=checkpoint["member"], member_row=checkpoint["member_row"],
            rows_processed=checkpoint["rows_processed"],
        )
        self.job["rows_in_window"] += len(records)
        self.job["batches_committed"] += 1
        self.job["records_inserted"] += inserted
        self.job["records_updated"] += len(records) - inserted
        self.job["companies_created"] += inserted
        self.job["awards_created"] += inserted
        self.job["transactions_created"] += inserted

    def finish_backfill_job(self, job_id, status, **kwargs):
        self.job["status"] = status
        self.job["records_skipped"] += kwargs.get("skipped", 0)
        self.job["records_failed"] += kwargs.get("failed", 0)
        for key in ("member", "member_row", "rows_processed"):
            if kwargs.get(key) is not None:
                self.job[{"member": "current_member"}.get(key, key)] = kwargs[key]
        return dict(self.job)


class NoNetworkClient:
    pass


def test_fiscal_year_windows_cross_october_boundary():
    assert fiscal_years(date(2021, 10, 1), date(2023, 9, 30)) == [2022, 2023]


def test_archive_column_mapping_keeps_recipient_and_performance_separate():
    raw = archive_row_to_source({
        "contract_transaction_unique_key": "tx", "contract_award_unique_key": "award", "recipient_name": "Acme",
        "recipient_state_code": "MD", "recipient_county_fips_code": "24031",
        "primary_place_of_performance_state_code": "VA", "primary_place_of_performance_county_fips_code": "51059",
    })
    assert raw["Recipient Location"]["county_fips"] == "24031"
    assert raw["Primary Place of Performance"]["county_fips"] == "51059"
    assert raw["transaction_id"] == "tx"


def test_bounded_backfill_resumes_from_atomic_checkpoint(tmp_path):
    source = tmp_path / "official-format.csv"
    write_csv(source)
    repository = FakeRepository()
    runner = BackfillRunner(repository, NoNetworkClient())
    first = runner.run(date(2022, 1, 1), date(2022, 1, 3), tmp_path, batch_size=2, max_records=1, source_file=source)
    second = runner.run(date(2022, 1, 1), date(2022, 1, 3), tmp_path, batch_size=2, source_file=source)
    third = runner.run(date(2022, 1, 1), date(2022, 1, 3), tmp_path, batch_size=2, source_file=source)
    assert first["status"] == "partial"
    assert second["status"] == "success"
    assert third["status"] == "success"
    assert third["archives"] == [
        {"job_id": "job-1", "status": "success", "resumed": True, "already_complete": True}
    ]
    assert repository.transactions == {"tx-1", "tx-2", "tx-3"}
    assert repository.job["records_inserted"] == 3
    assert repository.job["rows_processed"] == 3


def test_archive_discovery_selects_full_file_not_delta(monkeypatch):
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {"monthly_files": [
                {"fiscal_year": 2022, "file_name": "FY2022_All_Contracts_Full_20240101.zip", "url": "https://files/full.zip", "updated_date": "2024-01-01"},
                {"fiscal_year": None, "file_name": "FY(All)_All_Contracts_Delta_20240102.zip", "url": "https://files/delta.zip", "updated_date": "2024-01-02"},
            ]}
    client = USAspendingArchiveClient()
    monkeypatch.setattr(client.session, "post", lambda *args, **kwargs: Response())
    archives = client.list_full_archives(date(2021, 10, 1), date(2022, 9, 30))
    assert [archive.url for archive in archives] == ["https://files/full.zip"]


def test_malformed_row_does_not_advance_checkpoint_past_failure(tmp_path):
    from ingestion.industry import IndustryClassifier

    class RejectingClassifier:
        def classify(self, raw):
            if raw.get("Transaction Description") == "reject this row":
                raise ValueError("deliberate malformed fixture")
            return IndustryClassifier().classify(raw)

    source = tmp_path / "malformed.csv"
    write_csv(source, reject_at=2)
    repository = FakeRepository()
    result = BackfillRunner(repository, NoNetworkClient(), classifier=RejectingClassifier()).run(
        date(2022, 1, 1), date(2022, 1, 3), tmp_path, batch_size=10, source_file=source
    )
    assert result["status"] == "partial"
    assert repository.transactions == {"tx-1"}
    assert repository.job["member_row"] == 1
    assert repository.job["rows_processed"] == 1
