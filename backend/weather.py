"""Open-Meteo historical weather client.

Wraps the archive endpoint so route handlers deal with one function and one
exception type instead of HTTP details.
"""

from datetime import date
from typing import Any, Dict

import httpx

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

# The four variables the case study asks for, plus precipitation, which costs
# nothing extra on the same request and makes the stored files more useful.
DAILY_VARIABLES = [
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "precipitation_sum",
]


class WeatherAPIError(Exception):
    """Raised when Open-Meteo is unreachable or returns an error."""


async def fetch_history(
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
) -> Dict[str, Any]:
    """Fetch daily history for one location and return the full API response."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": ",".join(DAILY_VARIABLES),
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(ARCHIVE_URL, params=params)
    except httpx.RequestError as exc:
        raise WeatherAPIError(f"Could not reach Open-Meteo: {exc}") from exc

    if response.status_code != 200:
        # Open-Meteo puts a human-readable explanation in `reason`.
        try:
            reason = response.json().get("reason", response.text)
        except ValueError:
            reason = response.text
        raise WeatherAPIError(f"Open-Meteo returned {response.status_code}: {reason}")

    return response.json()


def build_object_name(
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
    timestamp: str,
) -> str:
    """Object name in the format the case study specifies.

    Coordinates are rounded to four decimals (about 11 m) so a stray float
    does not produce an unreadable key, and the decimal point is replaced
    because it reads poorly inside a filename.
    """
    lat = f"{latitude:.4f}".replace(".", "p").replace("-", "m")
    lon = f"{longitude:.4f}".replace(".", "p").replace("-", "m")
    return f"weather_{lat}_{lon}_{start_date}_{end_date}_{timestamp}.json"