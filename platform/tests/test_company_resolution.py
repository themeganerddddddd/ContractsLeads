from ingestion.company_resolution import normalize_company_name, resolve_company


def test_uei_resolution_wins_over_name():
    rows = [
        {"id": "right", "uei": "ABC123", "legal_name": "Different Legal Entity"},
        {"id": "name", "uei": "OTHER", "legal_name": "Example Systems LLC"},
    ]
    match, method = resolve_company({"uei": "abc123", "legal_name": "Example Systems LLC"}, rows)
    assert match["id"] == "right"
    assert method == "uei"


def test_conflicting_ueis_never_merge_on_similar_name():
    rows = [{"id": "existing", "uei": "UEI-ONE", "legal_name": "BAE Systems Inc."}]
    match, method = resolve_company({"uei": "UEI-TWO", "legal_name": "BAE Systems, Inc."}, rows)
    assert match is None and method is None
    assert normalize_company_name("BAE Systems, Inc.") == normalize_company_name("BAE Systems Inc")


def test_name_fallback_requires_unidentified_single_exact_entity():
    row = {"id": "legacy", "uei": None, "legal_name": "Exact Example LLC"}
    assert resolve_company({"legal_name": "Exact Example Inc."}, [row]) == (row, "exact_normalized_name")
