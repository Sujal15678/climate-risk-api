from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import httpx

app = FastAPI(
    title="Climate Risk API",
    description="District-level climate risk analytics and parametric payout simulation for Indian agriculture.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

DISTRICTS = {
    "vikarabad": {"name": "Vikarabad, Telangana", "lat": 17.34, "lon": 77.90},
    "ahmedabad": {"name": "Ahmedabad, Gujarat", "lat": 23.02, "lon": 72.57},
    "jalna": {"name": "Jalna, Maharashtra", "lat": 19.84, "lon": 75.88},
    "barmer": {"name": "Barmer, Rajasthan", "lat": 25.75, "lon": 71.39},
    "anantapur": {"name": "Anantapur, Andhra Pradesh", "lat": 14.68, "lon": 77.60},
}


async def fetch_daily(lat: float, lon: float, start: str, end: str):
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start,
        "end_date": end,
        "daily": "precipitation_sum,temperature_2m_max",
        "timezone": "auto",
    }
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.get(ARCHIVE_URL, params=params)
        response.raise_for_status()
        return response.json()["daily"]


def longest_dry_spell(rainfall: List[float], threshold: float = 2.5) -> int:
    longest = 0
    current = 0
    for mm in rainfall:
        if mm is None or mm < threshold:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


@app.get("/")
def root():
    return {"service": "Climate Risk API", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/districts")
def list_districts():
    return [{"id": k, **v} for k, v in DISTRICTS.items()]


@app.get("/risk/{district_id}")
async def district_risk(district_id: str):
    if district_id not in DISTRICTS:
        raise HTTPException(status_code=404, detail=f"Unknown district: {district_id}")

    district = DISTRICTS[district_id]
    daily = await fetch_daily(
        district["lat"], district["lon"], "2005-01-01", "2024-12-31"
    )

    dates = daily["time"]
    rain = daily["precipitation_sum"]
    temp = daily["temperature_2m_max"]

    yearly = {}
    for i, date in enumerate(dates):
        year = int(date[:4])
        month = int(date[5:7])
        if year not in yearly:
            yearly[year] = {"rain": [], "hot_days": 0}
        if 6 <= month <= 9:
            yearly[year]["rain"].append(rain[i] or 0)
        if temp[i] is not None and temp[i] > 40:
            yearly[year]["hot_days"] += 1

    results = []
    for year in sorted(yearly):
        data = yearly[year]
        results.append({
            "year": year,
            "monsoon_rainfall_mm": round(sum(data["rain"]), 1),
            "longest_dry_spell_days": longest_dry_spell(data["rain"]),
            "heat_stress_days": data["hot_days"],
        })

    avg_rain = round(sum(r["monsoon_rainfall_mm"] for r in results) / len(results), 1)

    return {
        "district": district["name"],
        "years_analysed": len(results),
        "avg_monsoon_rainfall_mm": avg_rain,
        "yearly": results,
    }


@app.get("/payout/{district_id}")
async def simulate_payout(
    district_id: str,
    threshold_mm: float = 500.0,
    sum_insured: float = 20000.0,
    exit_mm: float = 200.0,
):
    if exit_mm >= threshold_mm:
        raise HTTPException(
            status_code=400, detail="exit_mm must be less than threshold_mm"
        )

    risk = await district_risk(district_id)

    results = []
    total_payout = 0.0
    trigger_years = 0

    for year_data in risk["yearly"]:
        rainfall = year_data["monsoon_rainfall_mm"]

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
            "year": year_data["year"],
            "monsoon_rainfall_mm": rainfall,
            "payout_inr": payout,
            "triggered": payout > 0,
        })

    years = len(results)

    return {
        "district": risk["district"],
        "policy": {
            "trigger_mm": threshold_mm,
            "exit_mm": exit_mm,
            "sum_insured_inr": sum_insured,
        },
        "years_analysed": years,
        "trigger_years": trigger_years,
        "trigger_rate_pct": round(trigger_years / years * 100, 1),
        "avg_annual_payout_inr": round(total_payout / years, 2),
        "burn_rate_pct": round(total_payout / (years * sum_insured) * 100, 2),
        "yearly": results,
    }