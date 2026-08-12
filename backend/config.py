"""Runtime configuration.

The storage backend is selected by which environment variables are present:
with a bucket and credentials the app uses S3, otherwise it falls back to the
local filesystem. S3_ENDPOINT_URL points boto3 at an S3-compatible provider;
leaving it unset targets AWS S3 itself.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
    S3_BUCKET = os.getenv("S3_BUCKET")
    S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")  # unset for AWS S3

    LOCAL_STORAGE_DIR = os.getenv("LOCAL_STORAGE_DIR", "./data")

    # Open-Meteo returns one row per day; 31 days keeps payloads small and
    # protects the upstream API from unbounded range requests.
    MAX_RANGE_DAYS = 31

    @property
    def use_s3(self) -> bool:
        return bool(self.S3_BUCKET and self.AWS_ACCESS_KEY_ID)


settings = Settings()