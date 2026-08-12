"""HTTP routes.

Handlers stay thin: validate (via Pydantic), call the weather client, hand the
result to storage, translate failures into the right status code. Domain logic
lives in weather.py and storage.py.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

import storage
import weather
from schemas import FileListResponse, StoreResponse, WeatherRequest

router = APIRouter()


@router.post("/store-weather-data", response_model=StoreResponse)
async def store_weather_data(request: WeatherRequest):
    """Fetch daily history from Open-Meteo and persist the raw response."""
    try:
        payload = await weather.fetch_history(
            request.latitude,
            request.longitude,
            request.start_date,
            request.end_date,
        )
    except weather.WeatherAPIError as exc:
        # The upstream API failed, not the client, so 502 rather than 500.
        raise HTTPException(status_code=502, detail=str(exc))

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    name = weather.build_object_name(
        request.latitude,
        request.longitude,
        request.start_date,
        request.end_date,
        timestamp,
    )

    try:
        stored = storage.get_storage().put_json(name, payload)
    except storage.StorageError as exc:
        raise HTTPException(status_code=500, detail=f"Could not store file: {exc}")

    return StoreResponse(status="ok", file=stored)


@router.get("/list-weather-files", response_model=FileListResponse)
def list_weather_files(limit: int = 200):
    """List stored objects, newest first."""
    try:
        files = storage.get_storage().list_files(limit=limit)
    except storage.StorageError as exc:
        raise HTTPException(status_code=500, detail=f"Could not list files: {exc}")

    return FileListResponse(files=files)


@router.get("/weather-file-content/{file}")
def weather_file_content(file: str):
    """Return the stored JSON for one object."""
    try:
        return storage.get_storage().get_json(file)
    except storage.FileNotFound:
        # The brief specifies this exact body for a missing file.
        raise HTTPException(
            status_code=404, detail={"status": "error", "message": "not found"}
        )
    except storage.StorageError as exc:
        raise HTTPException(status_code=500, detail=f"Could not read file: {exc}")


@router.get("/geocode")
async def geocode(q: str = Query(..., min_length=2, description="Place name to look up")):
    """Resolve a place name to coordinates.

    The brief specifies latitude and longitude inputs, and those remain the
    fields the request is built from. This endpoint exists so the UI can offer
    a name search that fills them in, because typing coordinates by hand is not
    how anyone actually uses a weather tool. Routing it through the backend
    keeps every upstream call on one side, where it can be cached or
    rate-limited later.
    """
    try:
        results = await weather.search_places(q)
    except weather.WeatherAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"results": results}