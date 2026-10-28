from datetime import date, datetime, timezone

from movements.sec import SecSubmissionsAdapter


def submissions_payload():
    return {
        "filings": {
            "recent": {
                "accessionNumber": ["0000123456-26-000010", "0000123456-26-000009", "0000123456-26-000008"],
                "filingDate": ["2026-10-20", "2026-10-18", "2026-10-15"],
                "reportDate": ["2026-10-20", "2026-09-30", "2026-09-30"],
                "acceptanceDateTime": ["20261020120000", "20261018120000", "20261015120000"],
                "form": ["8-K", "S-3", "10-Q"],
                "items": ["1.01,2.03", "", ""],
                "primaryDocument": ["event.htm", "registration.htm", "quarterly.htm"],
                "primaryDocDescription": ["Current report", "Registration statement", "Quarterly report"],
            }
        }
    }


def test_sec_parser_keeps_relevant_disclosures_and_skips_general_quarterly_filing():
    records = SecSubmissionsAdapter.parse_submissions(
        submissions_payload(),
        {"company_id": "company-1", "canonical_name": "Example Corporation", "cik": "123456"},
        observed_at=datetime(2026, 10, 23, tzinfo=timezone.utc),
    )
    assert [record.payload["form"] for record in records] == ["8-K", "S-3"]
    assert records[0].publication_date == date(2026, 10, 20)
    assert records[0].source_url.endswith("/123456/000012345626000010/event.htm")


def test_sec_normalization_links_by_cik_and_does_not_invent_funding_amount():
    envelope = SecSubmissionsAdapter.parse_submissions(
        submissions_payload(),
        {"company_id": "company-1", "canonical_name": "Example Corporation", "cik": "123456"},
        observed_at=datetime(2026, 10, 23, tzinfo=timezone.utc),
    )[1]
    movement = SecSubmissionsAdapter([], user_agent="Federal Ledger test contact@example.com").normalize(envelope)
    assert movement.event["event_type"] == "regulatory_disclosure"
    assert movement.event["event_status"] == "filed"
    assert movement.event["event_subtype"] == "securities_registration_disclosure"
    assert movement.event["capital_investment"] is None
    assert movement.event["event_date"] == date(2026, 10, 18)
    assert movement.identifiers == ({"system": "SEC_CIK", "value": "0000123456", "country_code": "US"},)
    assert movement.source["commercial_use_status"] == "permitted"
    assert movement.source["license_name"] == "SEC EDGAR public filing reuse policy"
    assert "not proof" in movement.event["summary"]


def test_sec_fetch_requires_identifying_user_agent_when_targets_exist():
    adapter = SecSubmissionsAdapter(
        [{"company_id": "company-1", "canonical_name": "Example Corporation", "cik": "0000123456"}],
        user_agent="",
    )
    try:
        list(adapter.fetch(limit=1))
    except RuntimeError as error:
        assert "SEC_USER_AGENT" in str(error)
    else:
        raise AssertionError("SEC fetch should require an identifying user agent")
