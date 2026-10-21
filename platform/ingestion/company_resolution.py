from __future__ import annotations

import re
from typing import Iterable

LEGAL_SUFFIXES = re.compile(r"\b(incorporated|inc|llc|ltd|limited|corp|corporation|company|co|lp|l\.p)\b", re.I)
NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize_company_name(value: str | None) -> str:
    value = (value or "").casefold().replace("&", " and ")
    value = LEGAL_SUFFIXES.sub(" ", value)
    return " ".join(NON_ALNUM.sub(" ", value).split())


def resolve_company(incoming: dict, candidates: Iterable[dict]) -> tuple[dict | None, str | None]:
    """Resolve conservatively: UEI, then CAGE, then exact name only without identifier conflict."""
    rows = list(candidates)
    uei = str(incoming.get("uei") or "").strip().upper()
    if uei:
        match = next((row for row in rows if str(row.get("uei") or "").strip().upper() == uei), None)
        return (match, "uei") if match else (None, None)
    cage = str(incoming.get("cage_code") or "").strip().upper()
    if cage:
        match = next((row for row in rows if str(row.get("cage_code") or "").strip().upper() == cage), None)
        return (match, "cage_code") if match else (None, None)
    normalized = normalize_company_name(incoming.get("legal_name") or incoming.get("canonical_name"))
    name_matches = [
        row for row in rows
        if normalize_company_name(row.get("legal_name") or row.get("canonical_name")) == normalized
    ]
    if len(name_matches) == 1 and not name_matches[0].get("uei"):
        return name_matches[0], "exact_normalized_name"
    return None, None
