from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import httpx

app = FastAPI(
    title="Climate Risk API",
    description="District-level climate risk analytics and parametric payout simulation for Indian agriculture.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

DISTRICTS = {
    # Telangana
    "vikarabad": {"name": "Vikarabad", "state": "Telangana", "lat": 17.34, "lon": 77.90},
    "nalgonda": {"name": "Nalgonda", "state": "Telangana", "lat": 17.05, "lon": 79.27},
    # Andhra Pradesh — Rayalaseema
    "anantapur": {"name": "Anantapur", "state": "Andhra Pradesh", "lat": 14.68, "lon": 77.60},
    "kurnool": {"name": "Kurnool", "state": "Andhra Pradesh", "lat": 15.83, "lon": 78.04},
    # Karnataka — North Interior
    "vijayapura": {"name": "Vijayapura", "state": "Karnataka", "lat": 16.83, "lon": 75.71},
    "kalaburagi": {"name": "Kalaburagi", "state": "Karnataka", "lat": 17.33, "lon": 76.83},
    "chitradurga": {"name": "Chitradurga", "state": "Karnataka", "lat": 14.23, "lon": 76.40},
    # Maharashtra — Marathwada
    "jalna": {"name": "Jalna", "state": "Maharashtra", "lat": 19.84, "lon": 75.88},
    "beed": {"name": "Beed", "state": "Maharashtra", "lat": 18.99, "lon": 75.76},
    "dharashiv": {"name": "Dharashiv", "state": "Maharashtra", "lat": 18.19, "lon": 76.04},
    "solapur": {"name": "Solapur", "state": "Maharashtra", "lat": 17.66, "lon": 75.91},
    # Gujarat — Saurashtra & Kutch
    "ahmedabad": {"name": "Ahmedabad", "state": "Gujarat", "lat": 23.02, "lon": 72.57},
    "rajkot": {"name": "Rajkot", "state": "Gujarat", "lat": 22.30, "lon": 70.80},
    "kutch": {"name": "Kutch", "state": "Gujarat", "lat": 23.24, "lon": 69.67},
    "banaskantha": {"name": "Banaskantha", "state": "Gujarat", "lat": 24.17, "lon": 72.43},
    # Rajasthan — Western arid
    "barmer": {"name": "Barmer", "state": "Rajasthan", "lat": 25.75, "lon": 71.39},
    "jodhpur": {"name": "Jodhpur", "state": "Rajasthan", "lat": 26.24, "lon": 73.02},
    "bikaner": {"name": "Bikaner", "state": "Rajasthan", "lat": 28.02, "lon": 73.31},
    "jaisalmer": {"name": "Jaisalmer", "state": "Rajasthan", "lat": 26.92, "lon": 70.92},
    # Madhya Pradesh
    "vidisha": {"name": "Vidisha", "state": "Madhya Pradesh", "lat": 23.52, "lon": 77.81},
    "chhatarpur": {"name": "Chhatarpur", "state": "Madhya Pradesh", "lat": 24.92, "lon": 79.59},
    # Uttar Pradesh — Bundelkhand
    "jhansi": {"name": "Jhansi", "state": "Uttar Pradesh", "lat": 25.45, "lon": 78.57},
    "banda": {"name": "Banda", "state": "Uttar Pradesh", "lat": 25.48, "lon": 80.33},
    # Tamil Nadu — rain shadow
    "ramanathapuram": {"name": "Ramanathapuram", "state": "Tamil Nadu", "lat": 9.37, "lon": 78.83},
    "thoothukudi": {"name": "Thoothukudi", "state": "Tamil Nadu", "lat": 8.76, "lon": 78.13},
    # Odisha — KBK
    "bolangir": {"name": "Bolangir", "state": "Odisha", "lat": 20.71, "lon": 83.48},
    "kalahandi": {"name": "Kalahandi", "state": "Odisha", "lat": 19.91, "lon": 83.16},
    # Bihar / Jharkhand
    "gaya": {"name": "Gaya", "state": "Bihar", "lat": 24.79, "lon": 85.00},
    "palamu": {"name": "Palamu", "state": "Jharkhand", "lat": 24.04, "lon": 84.07},
}

MONSOON_START_MONTH = 6
MONSOON_END_MONTH = 9
RAINY_DAY_MM = 2.5
HEAT_STRESS_C = 40.0


async def fetch_daily(lat: float, lon: float, start: str, end: str):
    """Fetch daily rainfall and max temperature from the Open-Meteo ERA5 archive."""
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


def longest_dry_spell(rainfall: List[float], threshold: float = RAINY_DAY_MM) -> int:
    """Longest run of consecutive days below the IMD rainy-day threshold."""
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
    return {"service": "Climate Risk API", "status": "running", "districts": len(DISTRICTS)}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/districts")
def list_districts():
    """Districts available for analysis, drawn from India's recognised drought-prone belts."""
    return [{"id": key, **value} for key, value in DISTRICTS.items()]


@app.get("/risk/{district_id}")
async def district_risk(district_id: str):
    """Season-by-season rainfall, dry spell and heat stress indicators for one district."""
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
        "district": f'{district["name"]}, {district["state"]}',
        "coordinates": {"lat": district["lat"], "lon": district["lon"]},
        "years_analysed": len(results),
        "avg_monsoon_rainfall_mm": avg_rain,
        "yearly": results,
    }


@app.get("/payout/{district_id}")
async def simulate_payout(
    district_id: str,
    threshold_mm: float = 650.0,
    exit_mm: float = 300.0,
    sum_insured: float = 20000.0,
):
    """Back-test a linear rainfall-deficit cover against twenty observed seasons."""
    if exit_mm >= threshold_mm:
        raise HTTPException(
            status_code=400, detail="exit_mm must be less than threshold_mm"
        )
    if sum_insured <= 0:
        raise HTTPException(status_code=400, detail="sum_insured must be positive")

    risk = await district_risk(district_id)

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
        "district": risk["district"],
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