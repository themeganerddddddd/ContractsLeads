from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@dataclass(frozen=True)
class Settings:
    database_url: str
    usaspending_base_url: str = "https://api.usaspending.gov"
    overlap_days: int = 3
    reconciliation_days: int = 30
    page_limit: int = 100
    batch_size: int = 500
    backfill_cache_dir: str = ".backfill-cache"

    @classmethod
    def from_env(cls) -> "Settings":
        database_url = (
            os.getenv("PLATFORM_DATABASE_DIRECT_URL")
            or os.getenv("DATABASE_DIRECT_URL")
            or os.getenv("DATABASE_URL", "")
        )
        if not database_url:
            raise RuntimeError("PLATFORM_DATABASE_DIRECT_URL or DATABASE_URL is required")
        return cls(
            database_url=database_url,
            usaspending_base_url=os.getenv("USA_SPENDING_BASE_URL", "https://api.usaspending.gov").rstrip("/"),
            overlap_days=max(1, int(os.getenv("INGESTION_OVERLAP_DAYS", "3"))),
            reconciliation_days=max(1, int(os.getenv("RECONCILIATION_DAYS", "30"))),
            page_limit=max(1, min(100, int(os.getenv("INGESTION_PAGE_LIMIT", "100")))),
            batch_size=max(1, int(os.getenv("INGESTION_BATCH_SIZE", "500"))),
            backfill_cache_dir=os.getenv("BACKFILL_CACHE_DIR", ".backfill-cache"),
        )
