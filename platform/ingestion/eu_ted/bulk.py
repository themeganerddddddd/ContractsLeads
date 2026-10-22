from __future__ import annotations

import os
import tarfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


@dataclass(frozen=True)
class TEDPackage:
    key: str
    url: str


class TEDBulkClient:
    """Download official TED monthly XML reuse packages, one at a time."""

    def __init__(self, base_url: str = "https://ted.europa.eu/packages/monthly", max_package_bytes: int | None = None):
        self.base_url = base_url.rstrip("/")
        configured_max = os.getenv("BACKFILL_MAX_DOWNLOAD_BYTES", "").strip()
        self.max_package_bytes = max_package_bytes if max_package_bytes is not None else (int(configured_max) if configured_max else None)
        self.session = requests.Session()
        self.session.mount("https://", HTTPAdapter(max_retries=Retry(total=5, backoff_factor=2, status_forcelist=(429, 500, 502, 503, 504))))
        self.session.headers.update({"User-Agent": "FederalLedger/0.3 (TED public data importer)"})

    def monthly(self, year: int, month: int) -> TEDPackage:
        key = f"{year}-{month}"
        return TEDPackage(key, f"{self.base_url}/{key}")

    def download(self, package: TEDPackage, cache_dir: Path) -> Path:
        cache_dir.mkdir(parents=True, exist_ok=True)
        target = (cache_dir / f"ted-{package.key}.tar.gz").resolve()
        if cache_dir.resolve() not in target.parents:
            raise ValueError("TED package target escaped the cache directory")
        partial = target.with_suffix(".part")
        head = self.session.head(package.url, allow_redirects=True, timeout=60)
        head.raise_for_status()
        total = int(head.headers["Content-Length"]) if head.headers.get("Content-Length", "").isdigit() else None
        if self.max_package_bytes is not None and total is not None and total > self.max_package_bytes:
            raise RuntimeError(f"TED package is {total} bytes, above BACKFILL_MAX_DOWNLOAD_BYTES={self.max_package_bytes}")
        if target.exists() and (total is None or target.stat().st_size == total):
            return target
        offset = partial.stat().st_size if partial.exists() else 0
        headers = {"Range": f"bytes={offset}-"} if offset else {}
        with self.session.get(package.url, headers=headers, stream=True, timeout=(30, 300)) as response:
            response.raise_for_status()
            if response.status_code == 202 or "text/html" in response.headers.get("Content-Type", ""):
                raise RuntimeError("TED returned a challenge page instead of the XML package")
            resumed = offset > 0 and response.status_code == 206
            with partial.open("ab" if resumed else "wb") as handle:
                if not resumed:
                    offset = 0
                for chunk in response.iter_content(8 * 1024 * 1024):
                    if chunk:
                        handle.write(chunk)
                handle.flush()
                os.fsync(handle.fileno())
        if total is not None and partial.stat().st_size != total:
            raise IOError(f"TED package download size mismatch: expected {total}, received {partial.stat().st_size}")
        partial.replace(target)
        return target


def iter_xml(path: Path) -> Iterator[tuple[str, bytes]]:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            for member in sorted(archive.infolist(), key=lambda item: item.filename):
                if not member.is_dir() and member.filename.lower().endswith(".xml"):
                    yield member.filename, archive.read(member)
        return
    with tarfile.open(path, "r:*") as archive:
        for member in sorted(archive.getmembers(), key=lambda item: item.name):
            if member.isfile() and member.name.lower().endswith(".xml"):
                handle = archive.extractfile(member)
                if handle:
                    yield member.name, handle.read()
