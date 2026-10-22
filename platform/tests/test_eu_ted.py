from __future__ import annotations

from datetime import datetime, timezone
import io
import tarfile

from ingestion.adapters import SourceEnvelope
from ingestion.eu_ted.adapter import TEDAdapter
from ingestion.eu_ted.bulk import TEDBulkClient, iter_xml
from ingestion.eu_ted.xml import parse_ted_xml


NOTICE = {
    "publication-number": "123456-2026",
    "notice-identifier": "c48d5600-a161-4d24-b94f-fb513b97422f",
    "notice-version": "02",
    "procedure-identifier": "f350879e-4444-4bdb-bb25-ae6737f92c65",
    "notice-type": "Contract or concession award notice – standard regime",
    "notice-subtype": "29",
    "publication-date": "2026-10-20+02:00",
    "dispatch-date": "2026-10-19+02:00",
    "buyer-name": {"eng": ["Example Ministry"]},
    "buyer-country": ["DEU"],
    "organisation-identifier-buyer": ["ORG-0001"],
    "classification-cpv": ["72000000"],
    "identifier-lot": ["LOT-0001"],
    "contract-identifier": ["CON-0001"],
    "organisation-name-tenderer": {"eng": ["Example Supplier GmbH"]},
    "organisation-identifier-tenderer": ["ORG-0099"],
    "organisation-country-tenderer": ["DEU"],
    "result-value-notice": "250000.00",
    "result-value-cur-notice": "EUR",
    "links": {
        "html": {"ENG": "https://ted.europa.eu/en/notice/-/detail/123456-2026"},
        "xml": {"MUL": "https://ted.europa.eu/en/notice/123456-2026/xml"},
    },
}


def test_ted_notice_normalization_keeps_market_country_versions_and_links():
    envelope = SourceEnvelope(
        "eu_ted", NOTICE["notice-identifier"], NOTICE["links"]["html"]["ENG"],
        datetime(2026, 10, 20, tzinfo=timezone.utc), NOTICE,
    )
    row = TEDAdapter().normalize(envelope)
    assert row["source_market"] == "EU_TED"
    assert row["source_country"] == "DEU"
    assert row["source_process_id"] == NOTICE["procedure-identifier"]
    assert row["notice"]["notice_version"] == "02"
    assert row["notice"]["xml_url"].endswith("/xml")
    assert row["lots"][0]["source_lot_id"] == "LOT-0001"
    assert row["contracts"][0]["source_contract_id"] == "CON-0001"
    assert row["suppliers"][0]["legal_name"] == "Example Supplier GmbH"
    assert row["events"][0]["event_type"] == "award_announced"


def test_eforms_xml_parser_preserves_missing_values_as_null():
    xml = b'''<Notice xmlns="urn:example:eforms">
      <NoticeId>notice-1</NoticeId><NoticeVersion>3</NoticeVersion>
      <ProcedureIdentifier>procedure-1</ProcedureIdentifier><PublicationNumber>000001-2026</PublicationNumber>
      <PublicationDate>2026-01-05</PublicationDate><BuyerName>City Buyer</BuyerName>
      <ItemClassificationCode>45000000</ItemClassificationCode><LotIdentifier>LOT-1</LotIdentifier>
    </Notice>'''
    parsed = parse_ted_xml(xml)
    assert parsed["format"] == "eforms"
    assert parsed["notice_id"] == "notice-1"
    assert parsed["procedure_id"] == "procedure-1"
    assert parsed["cpv_codes"] == ["45000000"]
    assert parsed["value_native"] is None


def test_legacy_xml_parser_is_explicit_and_does_not_invent_ids():
    xml = b'''<TED_EXPORT><CODED_DATA_SECTION><NOTICE_DATA>
      <NO_DOC_OJS>000002-2019</NO_DOC_OJS><DATE_PUBLICATION>2019-02-03</DATE_PUBLICATION>
      <OFFICIALNAME>Regional Authority</OFFICIALNAME><CPV_CODE>33000000</CPV_CODE>
    </NOTICE_DATA></CODED_DATA_SECTION></TED_EXPORT>'''
    parsed = parse_ted_xml(xml)
    assert parsed["format"] == "legacy"
    assert parsed["publication_number"] == "000002-2019"
    assert parsed["procedure_id"] is None
    assert parsed["supplier_ids"] == []


def test_bulk_client_uses_official_monthly_tarball_and_streams_xml(tmp_path):
    package = TEDBulkClient().monthly(2025, 1)
    assert package.url == "https://ted.europa.eu/packages/monthly/2025-1"
    archive = tmp_path / "ted.tar.gz"
    payload = b"<Notice><NoticeId>n1</NoticeId></Notice>"
    with tarfile.open(archive, "w:gz") as handle:
        info = tarfile.TarInfo("nested/00000001_2025.xml")
        info.size = len(payload)
        handle.addfile(info, io.BytesIO(payload))
    assert list(iter_xml(archive)) == [("nested/00000001_2025.xml", payload)]
