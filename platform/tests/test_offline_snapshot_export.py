"""Ensure the database-free archive is reproducible from committed public inputs."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "platform/web/data/public-snapshot.json"


def test_archived_snapshot_is_reproducible_without_neon():
    result = subprocess.run(
        [sys.executable, "platform/scripts/export_offline_snapshot.py", "--check"],
        cwd=ROOT, capture_output=True, text=True, check=False, timeout=15,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_archived_snapshot_excludes_contacts_and_predictions():
    raw = OUTPUT.read_text(encoding="utf-8")
    data = json.loads(raw)
    assert len(data["companies"]) == 9
    assert len(data["awards"]) == 25
    assert len(raw) < 50_000
    for disallowed in (
        "contact_email", "contact_phone", "contact_name", "phone",
        "prediction_probability", "probability_eligible", "password",
    ):
        assert f'"{disallowed}"' not in raw
    assert all(
        not award["sourceUrl"] or award["sourceUrl"].startswith("https://")
        for award in data["awards"]
    )
