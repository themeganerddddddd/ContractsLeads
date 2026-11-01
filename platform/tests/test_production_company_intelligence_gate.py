from pathlib import Path

from scripts.production_company_intelligence_gate import CANONICAL_TABLES, REQUIRED_MIGRATIONS


ROOT = Path(__file__).resolve().parents[2]


def test_production_gate_tracks_exact_canonical_tables_and_pending_migrations():
    assert CANONICAL_TABLES == (
        "companies",
        "awards",
        "transactions",
        "procurement_processes",
        "procurement_events",
    )
    assert REQUIRED_MIGRATIONS == (
        "0011a_storage_headroom.sql",
        "0012_company_movement_intelligence.sql",
        "0013_company_tracking_product.sql",
        "0014_company_change_intelligence.sql",
        "0015_location_business_change.sql",
        "0015a_storage_headroom.sql",
    )


def test_manual_gate_uses_secret_without_printing_it_and_runs_bounded_sources_independently():
    workflow = (ROOT / ".github" / "workflows" / "platform-ingestion.yml").read_text(encoding="utf-8")
    assert "company-intelligence-gate" in workflow
    assert "secrets.PLATFORM_DATABASE_DIRECT_URL" in workflow
    assert "production_company_intelligence_gate.py snapshot" in workflow
    assert workflow.count("production_company_intelligence_gate.py verify") == 2
    for source in (
        "maryland-warn",
        "virginia-warn",
        "maryland-commerce",
        "montgomery-county-permits",
        "dc-basic-business-licenses",
    ):
        assert f"run_stage {source}" in workflow
    for assessment in ("expansion", "growth", "relocation", "contraction", "closure_distress"):
        assert f"--assessment-type {assessment} --limit \"$RECORD_LIMIT\"" in workflow
    assert "materialize-discoveries --limit 1000" in workflow
    assert "cat \"$RUNNER_TEMP/company-intelligence-failures.txt\"" in workflow
    assert "echo \"$PLATFORM_DATABASE_DIRECT_URL\"" not in workflow
    assert 'DATABASE_CAPACITY_BYTES: "1000000000"' in workflow


def test_materialization_has_a_non_alerting_cli_entry_point():
    source = (ROOT / "platform" / "movements" / "__main__.py").read_text(encoding="utf-8")
    branch = source.split('elif args.command == "materialize-discoveries":', 1)[1].split(
        'elif args.command == "review-match":', 1
    )[0]
    assert "tracking.materialize_discoveries" in branch
    assert "evaluate_active_targets" not in branch
    assert "evaluate_saved_searches" not in branch


def test_platform_runtime_dependencies_include_html_source_parser():
    requirements = (ROOT / "platform" / "requirements.txt").read_text(encoding="utf-8")
    assert "beautifulsoup4==4.12.3" in requirements


def test_assessment_cli_honors_the_validation_limit():
    source = (ROOT / "platform" / "movements" / "__main__.py").read_text(encoding="utf-8")
    assessment_branch = source.split('elif args.command in {"assess", "assess-v1"}:', 1)[1].split(
        'elif args.command == "outcomes-build":', 1
    )[0]
    assert "company_ids = company_ids[: args.limit]" in assessment_branch
