from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Protocol


@dataclass(frozen=True)
class ArchiveReceipt:
    object_key: str
    etag: str
    object_version: str | None
    compressed_bytes: int


class ArchiveBackend(Protocol):
    """Minimal provider-neutral interface used by retention workers."""

    def put(self, object_key: str, content: bytes, *, content_type: str, sha256: str) -> ArchiveReceipt: ...
    def read(self, object_key: str, *, object_version: str | None = None) -> bytes: ...


def _safe_key(object_key: str) -> PurePosixPath:
    key = PurePosixPath(object_key)
    if key.is_absolute() or ".." in key.parts or not key.parts:
        raise ValueError("archive object key must be a non-empty relative path")
    return key


class LocalArchiveBackend:
    """Credential-free backend for development, tests, and dry prototypes."""

    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, object_key: str) -> Path:
        key = _safe_key(object_key)
        path = (self.root / Path(*key.parts)).resolve()
        if self.root not in path.parents:
            raise ValueError("archive object key escapes the configured root")
        return path

    def put(self, object_key: str, content: bytes, *, content_type: str, sha256: str) -> ArchiveReceipt:
        del content_type
        digest = hashlib.sha256(content).hexdigest()
        if digest != sha256:
            raise ValueError("archive content checksum does not match the supplied sha256")
        path = self._path(object_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".partial")
        temporary.write_bytes(content)
        os.replace(temporary, path)
        return ArchiveReceipt(object_key, digest, None, len(content))

    def read(self, object_key: str, *, object_version: str | None = None) -> bytes:
        del object_version
        return self._path(object_key).read_bytes()


class S3CompatibleBackend:
    """S3-compatible adapter for R2, AWS S3, Backblaze B2, and peers.

    The caller supplies a configured client. Credentials remain in the provider
    SDK/environment and never enter archive manifests or application logs.
    """

    def __init__(self, client: Any, bucket: str, prefix: str = ""):
        if not bucket:
            raise ValueError("bucket is required")
        self.client = client
        self.bucket = bucket
        self.prefix = prefix.strip("/")

    def _key(self, object_key: str) -> str:
        key = _safe_key(object_key).as_posix()
        return f"{self.prefix}/{key}" if self.prefix else key

    def put(self, object_key: str, content: bytes, *, content_type: str, sha256: str) -> ArchiveReceipt:
        if hashlib.sha256(content).hexdigest() != sha256:
            raise ValueError("archive content checksum does not match the supplied sha256")
        response = self.client.put_object(
            Bucket=self.bucket,
            Key=self._key(object_key),
            Body=content,
            ContentType=content_type,
            Metadata={"sha256": sha256},
        )
        return ArchiveReceipt(
            object_key=object_key,
            etag=str(response.get("ETag") or "").strip('"'),
            object_version=response.get("VersionId"),
            compressed_bytes=len(content),
        )

    def read(self, object_key: str, *, object_version: str | None = None) -> bytes:
        request: dict[str, Any] = {"Bucket": self.bucket, "Key": self._key(object_key)}
        if object_version:
            request["VersionId"] = object_version
        return self.client.get_object(**request)["Body"].read()
