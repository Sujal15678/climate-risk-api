"""Request and response models.

All input validation lives here rather than in the route handlers, so FastAPI
can reject bad requests before any business logic runs and can advertise the
constraints in the generated OpenAPI docs.
"""

from datetime import date
from typing import List

from pydantic import BaseModel, Field, model_validator

from config import settings


class WeatherRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90, description="Degrees north, -90 to 90")
    longitude: float = Field(..., ge=-180, le=180, description="Degrees east, -180 to 180")
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def check_range(self):
        if self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date")

        span = (self.end_date - self.start_date).days + 1
        if span > settings.MAX_RANGE_DAYS:
            raise ValueError(
                f"Requested range is {span} days; the maximum is "
                f"{settings.MAX_RANGE_DAYS}"
            )

        if self.end_date > date.today():
            raise ValueError("end_date cannot be in the future")

        return self


class StoredFile(BaseModel):
    name: str
    size: int
    created_at: str


class FileListResponse(BaseModel):
    files: List[StoredFile]


class StoreResponse(BaseModel):
    status: str = "ok"
    file: str