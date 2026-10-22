from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from xml.etree import ElementTree as ET


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _texts(root: ET.Element, *names: str) -> list[str]:
    wanted = set(names)
    values: list[str] = []
    for node in root.iter():
        if _local(node.tag) in wanted and node.text and node.text.strip():
            value = node.text.strip()
            if value not in values:
                values.append(value)
    return values


def _first(root: ET.Element, *names: str) -> str | None:
    values = _texts(root, *names)
    return values[0] if values else None


def _decimal(value: str | None) -> Decimal | None:
    try:
        return Decimal(value) if value else None
    except InvalidOperation:
        return None


def _date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def parse_eforms_xml(content: bytes) -> dict[str, Any]:
    """Conservative namespace-agnostic eForms extraction.

    The raw XML remains authoritative. Missing fields stay null/empty and are
    never inferred from another address or identifier.
    """
    root = ET.fromstring(content)
    notice_id = _first(root, "NoticeId", "NoticeIdentifier", "UUID")
    procedure_id = _first(root, "ProcedureIdentifier", "ContractFolderID")
    publication = _first(root, "PublicationNumber", "PublicationID")
    buyer_names = _texts(root, "BuyerName")
    return {
        "format": "eforms",
        "notice_id": notice_id,
        "notice_version": _first(root, "NoticeVersion", "VersionID") or "1",
        "procedure_id": procedure_id,
        "publication_number": publication,
        "publication_date": _date(_first(root, "PublicationDate", "IssueDate")),
        "dispatch_date": _date(_first(root, "DispatchDate", "IssueDate")),
        "notice_type": _first(root, "NoticeTypeCode", "NoticeType"),
        "notice_subtype": _first(root, "NoticeSubType", "SubTypeCode"),
        "title": _first(root, "ProcedureTitle", "Title"),
        "description": _first(root, "ProcedureDescription"),
        "buyer_name": buyer_names[0] if buyer_names else None,
        "buyer_id": _first(root, "BuyerIdentifier"),
        "buyer_country": _first(root, "BuyerCountryCode"),
        "cpv_codes": _texts(root, "ItemClassificationCode", "MainCommodityClassificationID"),
        "lot_ids": _texts(root, "LotIdentifier", "ProcurementProjectLotID"),
        "contract_ids": _texts(root, "ContractIdentifier", "ContractID"),
        "supplier_names": _texts(root, "TendererName", "WinnerName"),
        "supplier_ids": _texts(root, "TendererIdentifier", "WinnerIdentifier"),
        "nuts_codes": _texts(root, "CountrySubentityCode", "NUTSCode"),
        "performance_countries": _texts(root, "PerformanceCountryCode"),
        "value_native": _decimal(_first(root, "TaxExclusiveAmount", "EstimatedOverallContractAmount")),
        "currency": next((node.attrib.get("currencyID") for node in root.iter() if node.attrib.get("currencyID")), None),
    }


def parse_legacy_xml(content: bytes) -> dict[str, Any]:
    """Extract common pre-eForms TED XML tags without pretending full parity."""
    root = ET.fromstring(content)
    return {
        "format": "legacy",
        "notice_id": _first(root, "NO_DOC_OJS", "NOTICE_ID", "ID_NOTICE"),
        "notice_version": _first(root, "VERSION") or "1",
        "procedure_id": _first(root, "REFERENCE_NUMBER", "FILE_REFERENCE"),
        "publication_number": _first(root, "NO_DOC_OJS"),
        "publication_date": _date(_first(root, "DATE_PUBLICATION", "DATE_OJ")),
        "dispatch_date": _date(_first(root, "DATE_DISPATCH_NOTICE", "DATE_DISPATCH")),
        "notice_type": _first(root, "FORM", "TYPE_CONTRACT"),
        "notice_subtype": None,
        "title": _first(root, "TITLE", "OBJECT_CONTRACT"),
        "description": _first(root, "SHORT_DESCR", "DESCRIPTION"),
        "buyer_name": _first(root, "OFFICIALNAME", "CA_CE_CONCESSIONAIRE_PROFILE"),
        "buyer_id": _first(root, "NATIONALID"),
        "buyer_country": _first(root, "COUNTRY"),
        "cpv_codes": _texts(root, "CPV_CODE", "MAIN_CPV_CODE"),
        "lot_ids": _texts(root, "LOT_NO", "LOT_NUMBER"),
        "contract_ids": _texts(root, "CONTRACT_NO", "CONTRACT_NUMBER"),
        "supplier_names": _texts(root, "AWARDED_CONTRACTOR_NAME", "CONTRACTOR_NAME"),
        "supplier_ids": _texts(root, "AWARDED_CONTRACTOR_NATIONALID"),
        "nuts_codes": _texts(root, "NUTS", "NUTS_CODE"),
        "performance_countries": [],
        "value_native": _decimal(_first(root, "VAL_TOTAL", "VAL_ESTIMATED_TOTAL")),
        "currency": _first(root, "CURRENCY"),
    }


def parse_ted_xml(content: bytes) -> dict[str, Any]:
    root = ET.fromstring(content)
    names = {_local(node.tag) for node in root.iter()}
    if {"NoticeId", "NoticeVersion", "ProcedureIdentifier"} & names:
        return parse_eforms_xml(content)
    return parse_legacy_xml(content)
