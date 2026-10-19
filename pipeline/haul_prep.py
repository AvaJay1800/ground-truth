"""Phase 3 prep: the what-if cleanup scope, candidate sites and precomputed routes.

Everything here is clearly a what-if. Nobody planned a cleanup this way at Oso;
the point is to show the same mass-haul math a construction site uses, on real
terrain and real roads.

1. Scope: the SR 530 corridor through the slide, 30 m (about 100 ft) either side
   of the OpenStreetMap centerline, clipped to where the ground changed. The
   volumes inside it come straight from the Phase 1 difference grid: "fill" is
   debris sitting on the old road corridor (to remove), "cut" is ground that was
   lost (to replace), both in bank cubic meters above the level of detection.
2. Sites: picked from the Washington DNR "Active Surface Mine Permit Sites"
   service, the state's public register of permitted pits. The nearest sand and
   gravel pit east of the slide is a WSDOT pit, used here as the disposal site;
   the nearest commercial pit west is used as the borrow site. Both are what-if
   choices; there is no record either was used this way in 2014.
3. Routes: fetched ONCE here from the public OSRM demo server (car profile,
   OpenStreetMap roads) and stored, so the live app never calls it. Durations
   are car durations; the app applies a loaded-truck factor on top.

Output: data/derived/haul.json

Usage:  python pipeline/haul_prep.py
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
import requests
from rasterio.features import geometry_mask
from shapely.geometry import LineString, mapping
from shapely.ops import unary_union
from shapely import transform as shp_transform
from pyproj import Transformer


def transform(fn, geom):
    """Apply a pyproj (x, y) -> (x, y) function to a shapely geometry."""
    return shp_transform(geom, lambda coords: np.column_stack(fn(coords[:, 0], coords[:, 1])))

from lod import volume_totals

ROOT = Path(__file__).resolve().parents[1]
DERIVED = ROOT / "data" / "derived"
RAW = ROOT / "data" / "raw"

CORRIDOR_HALF_WIDTH_M = 30.0
# Longitude window of SR 530 that crosses the slide and the lake (the study area's road segment).
CORRIDOR_LON = (-121.885, -121.805)

# Where the corridor meets the debris, used as the haul origin. Chosen on SR 530 at the
# west edge of the deposit so trucks stage on intact road.
ORIGIN_LONLAT = (-121.858, 48.2793)

SITES = [
    {
        "id": "disposal", "role": "disposal", "name": "WSDOT pit PS-D-170 (Boulder Creek)",
        "lon": -121.7744, "lat": 48.2772, "permit": 13154, "applicant": "DOT - DEPT OF TRANSPORTATION",
        "commodity": "Sand and Gravel", "permit_acres": 22.5,
        "why": "nearest permitted pit east of the slide and owned by the highway agency; a what-if choice for placing debris",
    },
    {
        "id": "borrow", "role": "borrow", "name": "Oso Gravel (Green Crow Corp.)",
        "lon": -121.9751, "lat": 48.2743, "permit": 12814, "applicant": "GREEN CROW CORP",
        "commodity": "Sand and Gravel", "permit_acres": 400,
        "why": "nearest permitted commercial sand and gravel pit west of the slide; a what-if source of fill",
    },
]
SITES_SOURCE = {
    "name": "Washington DNR, Active Surface Mine Permit Sites (ArcGIS REST, layer 0)",
    "url": "https://gis.dnr.wa.gov/site1/rest/services/Public_Geology/Active_Surface_Mine_Permit_Sites/MapServer/0",
    "fetched": date.today().isoformat(),
}
OSRM = "https://router.project-osrm.org/route/v1/driving/"


def corridor_polygon() -> dict:
    osm = json.loads((RAW / "osm" / "sr530.json").read_text(encoding="utf-8"))
    to_utm = Transformer.from_crs("EPSG:4326", "EPSG:26910", always_xy=True).transform
    to_ll = Transformer.from_crs("EPSG:26910", "EPSG:4326", always_xy=True).transform
    lines = []
    for way in osm["elements"]:
        pts = [(p["lon"], p["lat"]) for p in way.get("geometry", []) if CORRIDOR_LON[0] <= p["lon"] <= CORRIDOR_LON[1]]
        if len(pts) >= 2:
            lines.append(transform(to_utm, LineString(pts)))
    if not lines:
        raise SystemExit("no SR 530 geometry in the corridor window; run the Overpass query first")
    buffered = unary_union([ln.buffer(CORRIDOR_HALF_WIDTH_M, cap_style=2) for ln in lines])
    return {"utm": buffered, "lonlat": mapping(transform(to_ll, buffered))}


def corridor_volumes(poly_utm, lod_m: float) -> dict:
    with rasterio.open(DERIVED / "diff_m.tif") as diff, rasterio.open(DERIVED / "water_mask.tif") as wm:
        mask = geometry_mask([mapping(poly_utm)], out_shape=(diff.height, diff.width), transform=diff.transform, invert=True)
        d = diff.read(1, masked=True).filled(np.nan)
        w = wm.read(1) == 1
        inside = np.where(mask, d, np.nan)
        totals = volume_totals(inside, abs(diff.res[0] * diff.res[1]), lod_m, exclude=w)
        water_cells = int((mask & w).sum())
    return {**totals, "corridor_area_m2": float(poly_utm.area), "water_cells": water_cells,
            "cell_area_m2": abs(diff.res[0] * diff.res[1])}


def osrm_route(a: tuple[float, float], b: tuple[float, float]) -> dict:
    url = f"{OSRM}{a[0]},{a[1]};{b[0]},{b[1]}"
    r = requests.get(url, params={"overview": "full", "geometries": "geojson", "steps": "false"},
                     headers={"User-Agent": "ground-truth-pipeline/0.1 (one-off precompute)"}, timeout=60)
    r.raise_for_status()
    j = r.json()
    if j.get("code") != "Ok":
        raise SystemExit(f"OSRM: {j}")
    route = j["routes"][0]
    return {"distance_m": route["distance"], "duration_s": route["duration"], "geometry": route["geometry"]}


def main() -> int:
    summary = json.loads((DERIVED / "summary.json").read_text())
    lod_m = summary["lod"]["lod_m"]

    corr = corridor_polygon()
    vols = corridor_volumes(corr["utm"], lod_m)
    print(f"corridor: {vols['corridor_area_m2'] / 1e4:.1f} ha, debris on it {vols['fill_m3']:,.0f} m3, "
          f"ground lost {vols['cut_m3']:,.0f} m3, water cells {vols['water_cells']:,}")

    routes = {}
    for site in SITES:
        dest = (site["lon"], site["lat"])
        out = osrm_route(ORIGIN_LONLAT, dest)
        back = osrm_route(dest, ORIGIN_LONLAT)
        routes[site["id"]] = {
            "out": out, "back": back,
            "round_trip_km": (out["distance_m"] + back["distance_m"]) / 1000,
            "round_trip_min_car": (out["duration_s"] + back["duration_s"]) / 60,
        }
        print(f"{site['id']}: {out['distance_m'] / 1000:.1f} km / {out['duration_s'] / 60:.1f} min out, "
              f"{back['distance_m'] / 1000:.1f} km / {back['duration_s'] / 60:.1f} min back")

    haul = {
        "generated": date.today().isoformat(),
        "framing": "what-if cleanup of the SR 530 corridor; not a record of what was done in 2014",
        "origin_lonlat": ORIGIN_LONLAT,
        "corridor": {"geometry": corr["lonlat"], "half_width_m": CORRIDOR_HALF_WIDTH_M,
                     "source": "OpenStreetMap ways tagged ref=SR 530 (Overpass API), current alignment; the rebuilt highway follows the pre-slide corridor closely",
                     "volumes": vols},
        "sites": SITES,
        "sites_source": SITES_SOURCE,
        "routes": routes,
        "routing": {"engine": "OSRM demo server, car profile, OpenStreetMap data", "url": "https://router.project-osrm.org",
                    "fetched": date.today().isoformat(), "note": "fetched once by the pipeline; the app never calls it"},
    }
    (DERIVED / "haul.json").write_text(json.dumps(haul))
    print(f"wrote {DERIVED / 'haul.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
