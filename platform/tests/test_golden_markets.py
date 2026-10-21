from __future__ import annotations

import json
from datetime import date

from ingestion.golden_markets import GOLDEN_MARKETS, GoldenMarketValidator


def test_required_golden_markets_and_counties_are_defined():
    assert {market.slug for market in GOLDEN_MARKETS} == {"montgomery-md", "orleans-la", "madison-al", "northern-va"}
    assert ("MD", "24031") in GOLDEN_MARKETS[0].counties
    assert ("LA", "22071") in GOLDEN_MARKETS[1].counties
    assert ("AL", "01089") in GOLDEN_MARKETS[2].counties


def test_comparison_accepts_equal_metrics_and_flags_material_difference():
    baseline = {"companies": 10, "awards": 20, "transactions": 30, "disclosed_obligations": "100.00"}
    assert GoldenMarketValidator._comparison(baseline, dict(baseline))["status"] == "within_tolerance"
    different = {**baseline, "transactions": 25}
    result = GoldenMarketValidator._comparison(baseline, different)
    assert result["status"] == "review"
    assert result["differences"]["transactions"]["flagged"] is True


def test_existing_moco_snapshot_calculation_keeps_geography_modes_separate(tmp_path):
    fixture = [
        {
            "id": "one", "action_date": "2022-01-02", "recipient_in_moco": True, "performance_in_moco": False,
            "company": {"uei": "UEI1"}, "award": {"award_id": "A1", "amount": 25},
        },
        {
            "id": "two", "action_date": "2022-01-02", "recipient_in_moco": False, "performance_in_moco": True,
            "company": {"uei": "UEI2"}, "award": {"award_id": "A2", "amount": 40},
        },
    ]
    path = tmp_path / "contracts.json"
    path.write_text(json.dumps(fixture), encoding="utf-8")
    repository = type("Repository", (), {"connection": None})()
    validator = GoldenMarketValidator(repository, legacy_moco_path=path)
    recipient = validator._legacy_moco(date(2022, 1, 2), date(2022, 1, 2), "recipient")
    performance = validator._legacy_moco(date(2022, 1, 2), date(2022, 1, 2), "performance")
    assert recipient == {"companies": 1, "awards": 1, "transactions": 1, "disclosed_obligations": "25"}
    assert performance == {"companies": 1, "awards": 1, "transactions": 1, "disclosed_obligations": "40"}
