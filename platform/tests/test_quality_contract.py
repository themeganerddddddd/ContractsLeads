from pathlib import Path


QUALITY = (Path(__file__).resolve().parents[1] / "ingestion" / "quality.py").read_text(encoding="utf-8")


def test_quality_report_covers_required_duplicate_and_geography_diagnostics():
    for phrase in (
        "similar_names_different_uei_review",
        "piid_identity_conflicts",
        "transaction_id_duplicates",
        "recipient_state_county_fips_mismatch",
        "performance_state_county_fips_mismatch",
        "identical_recipient_performance_review",
    ):
        assert phrase in QUALITY


def test_quality_report_has_transaction_aware_industry_and_award_rollups():
    for phrase in (
        "representative_awards",
        "transaction_count",
        "total_disclosed_obligations",
        "latest_action_date",
        "other_award_share",
        "common_naics_mappings",
        "common_psc_mappings",
        "high_volume_other_codes",
    ):
        assert phrase in QUALITY
