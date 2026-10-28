from __future__ import annotations

from difflib import SequenceMatcher
from typing import Iterable

from ingestion.company_resolution import normalize_company_name

from .models import CompanyMatch


def match_company_name(observed_name: str | None, candidates: Iterable[dict]) -> CompanyMatch:
    """Link only a unique exact normalized name; keep fuzzy candidates for review."""
    if not observed_name or not normalize_company_name(observed_name):
        return CompanyMatch("unmatched", None, (), None, None)
    normalized = normalize_company_name(observed_name)
    rows = list(candidates)
    exact = [
        row
        for row in rows
        if normalized
        in {
            normalize_company_name(row.get("canonical_name")),
            normalize_company_name(row.get("legal_name")),
        }
    ]
    if len(exact) == 1:
        return CompanyMatch("matched", exact[0], tuple(exact), "exact_normalized_name", 0.96)
    if len(exact) > 1:
        return CompanyMatch("ambiguous", None, tuple(exact), "exact_normalized_name", 0.70)
    ranked = sorted(
        rows,
        key=lambda row: max(
            SequenceMatcher(None, normalized, normalize_company_name(row.get("canonical_name"))).ratio(),
            SequenceMatcher(None, normalized, normalize_company_name(row.get("legal_name"))).ratio(),
        ),
        reverse=True,
    )
    suggestions = tuple(row for row in ranked[:3] if max(
        SequenceMatcher(None, normalized, normalize_company_name(row.get("canonical_name"))).ratio(),
        SequenceMatcher(None, normalized, normalize_company_name(row.get("legal_name"))).ratio(),
    ) >= 0.72)
    return CompanyMatch("ambiguous" if suggestions else "unmatched", None, suggestions, "fuzzy_review_only" if suggestions else None, None)
