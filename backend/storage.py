"""Object storage abstraction.

The rest of the application talks to a StorageClient and never touches boto3
or the filesystem directly. Two implementations exist: an S3 client for
deployment and a local directory for development without credentials.
Swapping between them is a config change, not a code change.

The S3 client is written against the AWS S3 API. Setting S3_ENDPOINT_URL
points it at any S3-compatible provider; leaving it unset targets AWS itself.
"""

import json
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from config import settings


class StorageError(Exception):
    """Raised when the storage backend fails for a reason worth surfacing."""


class FileNotFound(StorageError):
    """Raised when a requested object does not exist."""


class StorageClient(ABC):
    @abstractmethod
    def put_json(self, key: str, payload: Dict[str, Any]) -> str:
        """Write a JSON document and return the stored object name."""

    @abstractmethod
    def list_files(self, limit: int = 200) -> List[Dict[str, Any]]:
        """Return object metadata, newest first."""

    @abstractmethod
    def get_json(self, key: str) -> Dict[str, Any]:
        """Read a JSON document. Raises FileNotFound if the key is absent."""


class S3Storage(StorageClient):
    def __init__(self):
        import boto3

        self.bucket = settings.S3_BUCKET
        # endpoint_url is None for AWS S3 and set for any S3-compatible
        # provider. Everything below this line is the same API either way.
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )

    def put_json(self, key: str, payload: Dict[str, Any]) -> str:
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=json.dumps(payload).encode("utf-8"),
            ContentType="application/json",
        )
        return key

    def list_files(self, limit: int = 200) -> List[Dict[str, Any]]:
        # MaxKeys asks the service for only what we need rather than
        # paginating the whole bucket and trimming client-side.
        response = self.client.list_objects_v2(Bucket=self.bucket, MaxKeys=limit)

        files = [
            {
                "name": obj["Key"],
                "size": obj["Size"],
                "created_at": obj["LastModified"].astimezone(timezone.utc).isoformat(),
            }
            for obj in response.get("Contents", [])
            if obj["Key"].endswith(".json")
        ]
        files.sort(key=lambda f: f["created_at"], reverse=True)
        return files

    def get_json(self, key: str) -> Dict[str, Any]:
        from botocore.exceptions import ClientError

        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code in ("NoSuchKey", "404", "NotFound"):
                raise FileNotFound(key) from exc
            raise StorageError(str(exc)) from exc

        return json.loads(response["Body"].read())


class LocalStorage(StorageClient):
    """Filesystem stand-in for S3, used when no bucket is configured."""

    def __init__(self):
        self.root = settings.LOCAL_STORAGE_DIR
        os.makedirs(self.root, exist_ok=True)

    def _path(self, key: str) -> str:
        # Reject any key that would escape the storage directory.
        if "/" in key or "\\" in key or key.startswith("."):
            raise FileNotFound(key)
        return os.path.join(self.root, key)

    def put_json(self, key: str, payload: Dict[str, Any]) -> str:
        with open(self._path(key), "w") as handle:
            json.dump(payload, handle)
        return key

    def list_files(self, limit: int = 200) -> List[Dict[str, Any]]:
        files = []
        for name in os.listdir(self.root):
            if not name.endswith(".json"):
                continue
            stat = os.stat(os.path.join(self.root, name))
            files.append({
                "name": name,
                "size": stat.st_size,
                "created_at": datetime.fromtimestamp(
                    stat.st_mtime, tz=timezone.utc
                ).isoformat(),
            })
        files.sort(key=lambda f: f["created_at"], reverse=True)
        return files[:limit]

    def get_json(self, key: str) -> Dict[str, Any]:
        path = self._path(key)
        if not os.path.isfile(path):
            raise FileNotFound(key)
        with open(path) as handle:
            return json.load(handle)


_client: Optional[StorageClient] = None


def get_storage() -> StorageClient:
    """Return the configured storage client, created once per process."""
    global _client
    if _client is None:
        _client = S3Storage() if settings.use_s3 else LocalStorage()
    return _client


def backend_name() -> str:
    return "s3" if settings.use_s3 else "local"