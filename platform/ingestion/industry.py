from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

TAXONOMY_PATH = Path(__file__).resolve().parents[1] / "shared" / "industry-taxonomy.json"


@dataclass(frozen=True)
class IndustryMatch:
    primary_slug: str
    confidence: float
    evidence: tuple[dict[str, str], ...]
    secondary_slugs: tuple[str, ...] = ()


class IndustryClassifier:
    def __init__(self, path: Path = TAXONOMY_PATH):
        self.data = json.loads(path.read_text(encoding="utf-8"))
        self.by_slug = {row["slug"]: row for row in self.data["industries"]}

    @staticmethod
    def _code(value) -> str:
        if isinstance(value, dict):
            value = value.get("code") or value.get("naics") or value.get("psc")
        return str(value or "").strip().upper()

    def classify(self, raw: dict) -> IndustryMatch:
        naics = self._code(raw.get("NAICS") or raw.get("naics"))
        psc = self._code(raw.get("PSC") or raw.get("psc"))
        if naics in self.data["naics"]:
            slug = self.data["naics"][naics]
            return IndustryMatch(slug, 0.98, ({"type": "naics", "value": naics},))
        if psc in self.data["psc"]:
            slug = self.data["psc"][psc]
            return IndustryMatch(slug, 0.95, ({"type": "psc", "value": psc},))
        text = " ".join(str(raw.get(key) or "") for key in (
            "Transaction Description", "description", "Awarding Agency", "Awarding Sub Agency", "title"
        )).casefold()
        matches: list[tuple[str, str]] = []
        for row in self.data["industries"]:
            for keyword in row.get("keywords", []):
                if keyword.casefold() in text:
                    matches.append((row["slug"], keyword))
                    break
        if not matches:
            return IndustryMatch("other", 0.30, ({"type": "fallback", "value": "unmapped"},))
        primary, keyword = matches[0]
        return IndustryMatch(
            primary,
            0.72,
            ({"type": "keyword", "value": keyword},),
            tuple(dict.fromkeys(slug for slug, _ in matches[1:] if slug != primary)),
        )
