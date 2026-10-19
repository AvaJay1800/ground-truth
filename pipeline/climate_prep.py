"""Phase 4: monthly climate normals for the site, for the schedule and the climate strip.

Primary source: Open-Meteo's historical weather API (ERA5 reanalysis, free, no
key), daily values 1991 to 2020 for the grid cell nearest the slide. Reanalysis
is a model blended with observations on a roughly 9 km grid, not a rain gauge
in the valley; the NOAA 1991-2020 station normals for the nearest cooperative
station are stored beside it as a cross-check, and the app shows both.

Counts per month (means over the 30 years):
  rain days        precipitation >= 2.5 mm (0.1 in), the usual "measurable rain day"
  heavy rain days  precipitation >= 12.7 mm (0.5 in)
  snow days        snowfall >= 1 cm
  freezing days    daily maximum temperature <= 0 C

Output: data/derived/climate.json

Usage:  python pipeline/climate_prep.py [--noaa-station USC00452030]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "climate"
DERIVED = ROOT / "data" / "derived"

SITE = (48.28, -121.85)
YEARS = (1991, 2020)
OPEN_METEO = "https://archive-api.open-meteo.com/v1/archive"
NCEI = "https://www.ncei.noaa.gov/access/services/data/v1"

RAIN_DAY_MM = 2.5
HEAVY_RAIN_MM = 12.7
SNOW_DAY_CM = 1.0
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def fetch_open_meteo() -> dict:
    path = RAW / f"open_meteo_{YEARS[0]}_{YEARS[1]}.json"
    if path.exists():
        return json.loads(path.read_text())
    r = requests.get(OPEN_METEO, params={
        "latitude": SITE[0], "longitude": SITE[1],
        "start_date": f"{YEARS[0]}-01-01", "end_date": f"{YEARS[1]}-12-31",
        "daily": "precipitation_sum,rain_sum,snowfall_sum,temperature_2m_max,temperature_2m_min,daylight_duration",
        "timezone": "America/Los_Angeles",
    }, timeout=180)
    r.raise_for_status()
    RAW.mkdir(parents=True, exist_ok=True)
    path.write_text(r.text)
    return r.json()


def monthly_normals(om: dict) -> list[dict]:
    d = om["daily"]
    years = defaultdict(set)
    acc = defaultdict(lambda: defaultdict(float))
    for i, t in enumerate(d["time"]):
        y, m = int(t[:4]), int(t[5:7])
        years[m].add(y)
        p = d["precipitation_sum"][i] or 0.0
        s = d["snowfall_sum"][i] or 0.0
        tmax = d["temperature_2m_max"][i]
        tmin = d["temperature_2m_min"][i]
        a = acc[m]
        a["precip_mm"] += p
        a["rain_days"] += p >= RAIN_DAY_MM
        a["heavy_rain_days"] += p >= HEAVY_RAIN_MM
        a["snow_days"] += s >= SNOW_DAY_CM
        a["freezing_days"] += (tmax is not None and tmax <= 0.0)
        a["tmax_sum"] += tmax or 0.0
        a["tmin_sum"] += tmin or 0.0
        a["daylight_s"] += d["daylight_duration"][i] or 0.0
        a["n"] += 1
    out = []
    for m in range(1, 13):
        a, ny, n = acc[m], len(years[m]), acc[m]["n"]
        out.append({
            "month": m, "name": MONTH_NAMES[m - 1], "days_in_month": DAYS_IN_MONTH[m - 1],
            "precip_mm": round(a["precip_mm"] / ny, 1),
            "rain_days": round(a["rain_days"] / ny, 1),
            "heavy_rain_days": round(a["heavy_rain_days"] / ny, 1),
            "snow_days": round(a["snow_days"] / ny, 1),
            "freezing_days": round(a["freezing_days"] / ny, 1),
            "tmax_c": round(a["tmax_sum"] / n, 1),
            "tmin_c": round(a["tmin_sum"] / n, 1),
            "daylight_h": round(a["daylight_s"] / n / 3600, 2),
        })
    return out


def fetch_noaa(station: str) -> list[dict] | None:
    path = RAW / f"noaa_normals_{station}.json"
    if not path.exists():
        r = requests.get(NCEI, params={
            "dataset": "normals-monthly-1991-2020", "stations": station,
            "dataTypes": "MLY-PRCP-NORMAL,MLY-TMAX-NORMAL,MLY-TMIN-NORMAL,MLY-PRCP-AVGNDS-GE010HI,MLY-PRCP-AVGNDS-GE050HI",
            "format": "json", "includeStationName": "true", "units": "metric",
        }, timeout=120)
        if r.status_code != 200:
            print("NOAA request failed:", r.status_code, r.text[:200])
            return None
        path.write_text(r.text)
    rows = json.loads(path.read_text())
    if not rows:
        return None

    def f(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    return [{
        "month": int(r["DATE"]), "station": r["STATION"], "name": r.get("NAME"),
        "precip_mm": f(r.get("MLY-PRCP-NORMAL")), "tmax_c": f(r.get("MLY-TMAX-NORMAL")), "tmin_c": f(r.get("MLY-TMIN-NORMAL")),
        "rain_days_ge_0_1in": f(r.get("MLY-PRCP-AVGNDS-GE010HI")), "rain_days_ge_0_5in": f(r.get("MLY-PRCP-AVGNDS-GE050HI")),
    } for r in sorted(rows, key=lambda r: int(r["DATE"]))]


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--noaa-station", default=None, help="NCEI station id for the cross-check, e.g. USC00452030")
    args = ap.parse_args(argv)

    om = fetch_open_meteo()
    months = monthly_normals(om)
    for m in months:
        print(f"{m['name']}: {m['precip_mm']:6.1f} mm, rain days {m['rain_days']:4.1f}, heavy {m['heavy_rain_days']:4.1f}, "
              f"snow {m['snow_days']:3.1f}, freezing {m['freezing_days']:3.1f}, tmax {m['tmax_c']:5.1f}, daylight {m['daylight_h']:5.2f} h")

    noaa = fetch_noaa(args.noaa_station) if args.noaa_station else None
    if noaa:
        print(f"NOAA cross-check: {noaa[0]['name']} ({noaa[0]['station']})")
        for a, b in zip(months, noaa):
            print(f"  {a['name']}: Open-Meteo {a['precip_mm']:6.1f} mm vs NOAA {b['precip_mm']} mm; "
                  f"rain days {a['rain_days']} vs {b['rain_days_ge_0_1in']}; tmax {a['tmax_c']} vs {b['tmax_c']}")

    out = {
        "generated": date.today().isoformat(),
        "site": {"lat": SITE[0], "lon": SITE[1]},
        "source": {
            "name": "Open-Meteo Historical Weather API (ERA5 reanalysis)",
            "url": "https://open-meteo.com/en/docs/historical-weather-api",
            "grid_point": {"lat": om.get("latitude"), "lon": om.get("longitude"), "elevation_m": om.get("elevation")},
            "years": list(YEARS),
            "note": "reanalysis on a ~9 km grid, not a gauge in the valley; counts are 30-year means",
        },
        "thresholds": {"rain_day_mm": RAIN_DAY_MM, "heavy_rain_mm": HEAVY_RAIN_MM, "snow_day_cm": SNOW_DAY_CM, "freezing": "daily max <= 0 C"},
        "months": months,
        "noaa_normals": noaa,
        "noaa_source": {
            "name": "NOAA NCEI U.S. Climate Normals 1991-2020, monthly",
            "url": "https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals",
        } if noaa else None,
    }
    DERIVED.mkdir(parents=True, exist_ok=True)
    (DERIVED / "climate.json").write_text(json.dumps(out, indent=1))
    print(f"wrote {DERIVED / 'climate.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
