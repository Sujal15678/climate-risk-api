from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import httpx

app = FastAPI(
    title="Climate Risk API",
    description="Rainfall risk analytics and parametric payout simulation for any location in India.",
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"

MONSOON_START_MONTH = 6
MONSOON_END_MONTH = 9
RAINY_DAY_MM = 2.5
HEAT_STRESS_C = 40.0

# Curated starting points from India's recognised drought-prone belts.
PRESETS = [
    {"name": "Vikarabad", "state": "Telangana", "lat": 17.34, "lon": 77.90},
    {"name": "Anantapur", "state": "Andhra Pradesh", "lat": 14.68, "lon": 77.60},
    {"name": "Jalna", "state": "Maharashtra", "lat": 19.84, "lon": 75.88},
    {"name": "Barmer", "state": "Rajasthan", "lat": 25.75, "lon": 71.39},
    {"name": "Jhansi", "state": "Uttar Pradesh", "lat": 25.45, "lon": 78.57},
    {"name": "Kalahandi", "state": "Odisha", "lat": 19.91, "lon": 83.16},
]

# Cache keyed on rounded coordinates. One Open-Meteo call covers 7,300 days,
# so repeated slider moves on the same location must not re-fetch.
_cache = {}


async def fetch_daily(lat: float, lon: float):
    key = (round(lat, 2), round(lon, 2))
    if key in _cache:
        return _cache[key]

    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": "2005-01-01",
        "end_date": "2024-12-31",
        "daily": "precipitation_sum,temperature_2m_max",
        "timezone": "auto",
    }
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.get(ARCHIVE_URL, params=params)
        response.raise_for_status()
        daily = response.json()["daily"]

    if len(_cache) > 200:
        _cache.clear()
    _cache[key] = daily
    return daily


def longest_dry_spell(rainfall: List[float], threshold: float = RAINY_DAY_MM) -> int:
    """Longest run of consecutive days below the IMD rainy-day threshold."""
    longest = current = 0
    for mm in rainfall:
        if mm is None or mm < threshold:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


@app.get("/")
def root():
    return {"service": "Climate Risk API", "status": "running", "coverage": "India"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/presets")
def presets():
    """Suggested starting locations across India's drought-prone belts."""
    return PRESETS


@app.get("/search")
async def search(q: str = Query(..., min_length=2)):
    """Look up any place in India by name and return its coordinates."""
    params = {"name": q, "count": 20, "language": "en", "format": "json"}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(GEOCODE_URL, params=params)
        response.raise_for_status()
        payload = response.json()

    results = []
    for place in payload.get("results", []):
        if place.get("country_code") != "IN":
            continue
        results.append({
            "name": place["name"],
            "state": place.get("admin1", ""),
            "district": place.get("admin2", ""),
            "lat": place["latitude"],
            "lon": place["longitude"],
        })
    return results[:10]


@app.get("/risk")
async def location_risk(
    lat: float = Query(..., ge=6.0, le=38.0),
    lon: float = Query(..., ge=68.0, le=98.0),
    name: Optional[str] = None,
):
    """Season-by-season rainfall, dry spell and heat stress for one location."""
    daily = await fetch_daily(lat, lon)

    dates = daily["time"]
    rain = daily["precipitation_sum"]
    temp = daily["temperature_2m_max"]

    yearly = {}
    for i, date in enumerate(dates):
        year = int(date[:4])
        month = int(date[5:7])
        if year not in yearly:
            yearly[year] = {"rain": [], "hot_days": 0}
        if MONSOON_START_MONTH <= month <= MONSOON_END_MONTH:
            yearly[year]["rain"].append(rain[i] or 0)
        if temp[i] is not None and temp[i] > HEAT_STRESS_C:
            yearly[year]["hot_days"] += 1

    results = []
    for year in sorted(yearly):
        season = yearly[year]
        results.append({
            "year": year,
            "monsoon_rainfall_mm": round(sum(season["rain"]), 1),
            "longest_dry_spell_days": longest_dry_spell(season["rain"]),
            "heat_stress_days": season["hot_days"],
        })

    avg_rain = round(sum(r["monsoon_rainfall_mm"] for r in results) / len(results), 1)

    return {
        "location": name or f"{lat:.2f}, {lon:.2f}",
        "coordinates": {"lat": lat, "lon": lon},
        "years_analysed": len(results),
        "avg_monsoon_rainfall_mm": avg_rain,
        "yearly": results,
    }


@app.get("/payout")
async def simulate_payout(
    lat: float = Query(..., ge=6.0, le=38.0),
    lon: float = Query(..., ge=68.0, le=98.0),
    name: Optional[str] = None,
    threshold_mm: float = 650.0,
    exit_mm: float = 300.0,
    sum_insured: float = 20000.0,
):
    """Back-test a linear rainfall-deficit cover against twenty observed seasons."""
    if exit_mm >= threshold_mm:
        raise HTTPException(400, "exit_mm must be less than threshold_mm")
    if sum_insured <= 0:
        raise HTTPException(400, "sum_insured must be positive")

    risk = await location_risk(lat=lat, lon=lon, name=name)

    results = []
    total_payout = 0.0
    trigger_years = 0

    for season in risk["yearly"]:
        rainfall = season["monsoon_rainfall_mm"]

        if rainfall >= threshold_mm:
            payout = 0.0
        elif rainfall <= exit_mm:
            payout = sum_insured
        else:
            shortfall = threshold_mm - rainfall
            span = threshold_mm - exit_mm
            payout = round(sum_insured * (shortfall / span), 2)

        if payout > 0:
            trigger_years += 1
        total_payout += payout

        results.append({
            "year": season["year"],
            "monsoon_rainfall_mm": rainfall,
            "longest_dry_spell_days": season["longest_dry_spell_days"],
            "payout_inr": payout,
            "triggered": payout > 0,
        })

    years = len(results)

    return {
        "location": risk["location"],
        "coordinates": risk["coordinates"],
        "policy": {
            "trigger_mm": threshold_mm,
            "exit_mm": exit_mm,
            "sum_insured_inr": sum_insured,
        },
        "avg_monsoon_rainfall_mm": risk["avg_monsoon_rainfall_mm"],
        "years_analysed": years,
        "trigger_years": trigger_years,
        "trigger_rate_pct": round(trigger_years / years * 100, 1),
        "avg_annual_payout_inr": round(total_payout / years, 2),
        "max_payout_inr": round(max(r["payout_inr"] for r in results), 2),
        "burn_rate_pct": round(total_payout / (years * sum_insured) * 100, 2),
        "yearly": results,
    }