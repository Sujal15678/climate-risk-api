"""Runtime configuration.

The storage backend is selected by which environment variables are present:
if an S3 bucket and credentials are configured we use S3, otherwise we fall
back to the local filesystem. This lets the same code run unchanged locally
and in the cloud.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
    S3_BUCKET = os.getenv("S3_BUCKET")

    LOCAL_STORAGE_DIR = os.getenv("LOCAL_STORAGE_DIR", "./data")

    # Open-Meteo returns one row per day; 31 days keeps payloads small and
    # protects the upstream API from unbounded range requests.
    MAX_RANGE_DAYS = 31

    @property
    def use_s3(self) -> bool:
        return bool(self.S3_BUCKET and self.AWS_ACCESS_KEY_ID)


settings = Settings()