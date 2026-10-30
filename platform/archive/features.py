from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Callable, Mapping, Sequence

from psycopg import sql

from .backend import ArchiveBackend


@dataclass(frozen=True)
class FeatureDataset:
    name: str
    date_column: str


FEATURE_DATASETS: Mapping[str, FeatureDataset] = {
    "company_monthly_features": FeatureDataset("company_monthly_features", "month"),
    "establishment_monthly_features": FeatureDataset("establishment_monthly_features", "month"),
    "geography_industry_monthly_features": FeatureDataset("geography_industry_monthly_features", "month"),
}


def _encode_parquet(rows: Sequence[Mapping[str, Any]]) -> bytes:
    """Encode a bounded feature batch without making PyArrow a web dependency."""
    try:
        import pyarrow as pa  # type: ignore[import-not-found]
        import pyarrow.parquet as parquet  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError("feature exports require the optional pyarrow package") from exc
    table = pa.Table.from_pylist([dict(row) for row in rows])
    output = io.BytesIO()
    parquet.write_table(table, output, compression="zstd")
    return output.getvalue()


class FeatureExportService:
    """Export permanent monthly features to verified Parquet objects.

    Exporting is additive: source feature rows remain in PostgreSQL. The
    uploaded object is independently read and checksummed before its manifest
    row is committed.
    """

    def __init__(
        self,
        connection,
        backend: ArchiveBackend | None = None,
        *,
        encoder: Callable[[Sequence[Mapping[str, Any]]], bytes] = _encode_parquet,
    ):
        self.connection = connection
        self.backend = backend
        self.encoder = encoder

    def plan(self, dataset_name: str, year: int) -> dict[str, Any]:
        dataset = self._dataset(dataset_name)
        period_start, period_end = _year_bounds(year)
        statement = sql.SQL(
            "SELECT count(*)::bigint AS row_count FROM {table} WHERE {month} >= %s AND {month} < %s"
        ).format(table=sql.Identifier(dataset.name), month=sql.Identifier(dataset.date_column))
        row = self.connection.execute(statement, (period_start, period_end)).fetchone()
        return {
            "dataset": dataset.name,
            "year": year,
            "period_start": period_start,
            "period_end_exclusive": period_end,
            "row_count": int(row["row_count"] if isinstance(row, dict) else row[0]),
            "read_only": True,
        }

    def export(self, dataset_name: str, year: int) -> dict[str, Any]:
        if self.backend is None:
            raise ValueError("an archive backend is required for feature-export")
        dataset = self._dataset(dataset_name)
        period_start, period_end = _year_bounds(year)
        statement = sql.SQL(
            "SELECT * FROM {table} WHERE {month} >= %s AND {month} < %s ORDER BY {month}"
        ).format(table=sql.Identifier(dataset.name), month=sql.Identifier(dataset.date_column))
        rows = [dict(row) for row in self.connection.execute(statement, (period_start, period_end)).fetchall()]
        if not rows:
            return {"dataset": dataset.name, "year": year, "row_count": 0, "message": "No feature rows to export."}
        content = self.encoder(rows)
        digest = hashlib.sha256(content).hexdigest()
        object_key = f"features/{dataset.name}/year={year}/{dataset.name}-{digest[:16]}.parquet"
        receipt = self.backend.put(object_key, content, content_type="application/vnd.apache.parquet", sha256=digest)
        independently_read = self.backend.read(object_key, object_version=receipt.object_version)
        if hashlib.sha256(independently_read).hexdigest() != digest:
            raise ValueError("feature export checksum verification failed after upload")
        exported_at = datetime.now(timezone.utc)
        manifest_end = date(year, 12, 31)
        self.connection.execute(
            """INSERT INTO feature_exports (
                 dataset,period_start,period_end,object_key,object_version,etag,sha256,row_count,
                 compressed_bytes,schema_version,verification_status,exported_at
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'verified',%s)
               ON CONFLICT (dataset,period_start,period_end,sha256) DO NOTHING""",
            (
                dataset.name, period_start, manifest_end, object_key, receipt.object_version,
                receipt.etag, digest, len(rows), len(content), "businesscurrent-features-v1", exported_at,
            ),
        )
        self.connection.commit()
        return {
            "dataset": dataset.name,
            "year": year,
            "row_count": len(rows),
            "object_key": object_key,
            "sha256": digest,
            "compressed_bytes": len(content),
            "verification_status": "verified",
        }

    @staticmethod
    def _dataset(dataset_name: str) -> FeatureDataset:
        try:
            return FEATURE_DATASETS[dataset_name]
        except KeyError as exc:
            raise ValueError(f"unknown feature dataset: {dataset_name}") from exc


def _year_bounds(year: int) -> tuple[date, date]:
    if year < 2000 or year > 2200:
        raise ValueError("feature export year must be between 2000 and 2200")
    return date(year, 1, 1), date(year + 1, 1, 1)
