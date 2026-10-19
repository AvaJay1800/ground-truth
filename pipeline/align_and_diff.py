"""Steps 2 to 5 of the pipeline: align, clip, difference, threshold.

What happens, in order, and why:

1. Pick one projected grid for everything: NAD83 / UTM zone 10N (EPSG:26910),
   1 m cells, meters horizontally and vertically. The portal serves both DEMs
   in Washington State Plane South with 3 ft cells and elevations in US survey
   feet. Feet are fine for subtraction, but every downstream consumer (terrain
   tiles, cubic-meter math, the 3D view) wants meters, so we convert once here.
2. Warp each epoch's tiles onto that grid with bilinear resampling and multiply
   the elevations by the US survey foot (0.30480060960121924 m), which is not
   the international foot (0.3048 m). The difference is 2 mm per 1,000 m of
   elevation, invisible here, but using the right constant is the point.
3. Clip to the study area, intersected with the footprint of the 2014 flight.
4. DEM of Difference: after minus before. Negative is loss (cut), positive is
   gain (fill).
5. Check the two surfaces agree where nothing happened. Over flat ground away
   from the slide the difference should be zero; its median is the vertical
   bias between the surveys (different geoid models, control networks, and the
   portal's resampling) and its spread is the real-world noise. We remove the
   bias, and we set the level of detection to the larger of the vendors'
   stated accuracy combined in quadrature and 1.96 times the measured spread.

Outputs (data/derived/):
  before_m.tif, after_m.tif, diff_m.tif   cloud-optimized GeoTIFFs, float32 meters
  summary.json                             totals, areas, uncertainty, provenance

Usage:  python pipeline/align_and_diff.py
"""
from __future__ import annotations

import json
import math
import sys
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import from_bounds as window_from_bounds

from lod import find_pool, level_of_detection, volume_totals

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "dnr"
OUT = ROOT / "data" / "derived"

TARGET_CRS = "EPSG:26910"          # NAD83 / UTM zone 10N, meters
CELL = 1.0                         # meters
US_SURVEY_FOOT = 0.30480060960121924
STUDY_AREA_LONLAT = (-121.90, 48.25, -121.80, 48.31)   # west, south, east, north

BEFORE_TILES = sorted((RAW / "dtm_43").rglob("*.tif"))   # Tulalip 2013
AFTER_TILES = sorted((RAW / "dtm_32").rglob("*.tif"))    # Snohoco Oso A 2014

# Stated vertical accuracy at 95 percent confidence, from each technical report.
SIGMA95_BEFORE_M = 0.054
SIGMA95_AFTER_M = 0.054

# Stable-ground mask settings for the bias and noise check.
STABLE_MAX_ABS_DIFF_M = 0.5     # candidate cells must have changed less than this
STABLE_MAX_SLOPE_DEG = 10.0     # and sit on gentle ground, where lidar is most reliable
EXCLUDE_NEAR_CHANGE_M = 300.0   # and be this far from any big change (> 2 m)
BIG_CHANGE_M = 2.0


def snapped_target_grid(tiles_after: list[Path]) -> tuple[rasterio.Affine, int, int, tuple[float, float, float, float]]:
    """Study area in the target CRS, intersected with the 2014 footprint, snapped to whole meters."""
    w, s, e, n = transform_bounds("EPSG:4326", TARGET_CRS, *STUDY_AREA_LONLAT, densify_pts=21)
    aw, as_, ae, an = math.inf, math.inf, -math.inf, -math.inf
    for t in tiles_after:
        with rasterio.open(t) as src:
            tw, ts, te, tn = transform_bounds(src.crs, TARGET_CRS, *src.bounds, densify_pts=21)
        aw, as_, ae, an = min(aw, tw), min(as_, ts), max(ae, te), max(an, tn)
    w, s, e, n = max(w, aw), max(s, as_), min(e, ae), min(n, an)
    w, s = math.floor(w), math.floor(s)
    e, n = math.ceil(e), math.ceil(n)
    width, height = int((e - w) / CELL), int((n - s) / CELL)
    return from_origin(w, n, CELL, CELL), width, height, (w, s, e, n)


def warp_epoch(tiles: list[Path], transform: rasterio.Affine, width: int, height: int) -> np.ndarray:
    """Warp every tile of one epoch into a single float32 array in meters. NaN where no data."""
    dst = np.full((height, width), np.nan, dtype=np.float32)
    for t in tiles:
        with rasterio.open(t) as src:
            # Only read the part of the tile that overlaps the target grid, in the tile's own CRS.
            tb = transform_bounds(TARGET_CRS, src.crs, *rasterio.transform.array_bounds(height, width, transform), densify_pts=21)
            win = window_from_bounds(*tb, transform=src.transform).round_offsets().round_lengths()
            win = win.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
            if win.width <= 0 or win.height <= 0:
                continue
            data = src.read(1, window=win, masked=True).filled(np.nan).astype(np.float32)
            reproject(
                source=data,
                destination=dst,
                src_transform=src.window_transform(win),
                src_crs=src.crs,
                src_nodata=np.nan,
                dst_transform=transform,
                dst_crs=TARGET_CRS,
                dst_nodata=np.nan,
                resampling=Resampling.bilinear,
                init_dest_nodata=False,
                num_threads=4,
            )
    dst *= np.float32(US_SURVEY_FOOT)
    return dst


def slope_degrees(dem: np.ndarray, cell: float) -> np.ndarray:
    gy, gx = np.gradient(dem, cell)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def distance_mask(mask: np.ndarray, radius_m: float, cell: float) -> np.ndarray:
    """True within radius of any True cell, by a cheap square dilation in chunks (no scipy)."""
    r = int(radius_m / cell)
    out = mask.copy()
    # Dilate along rows then columns with a running OR; square footprint is fine for an exclusion buffer.
    for axis in (0, 1):
        acc = out.copy()
        for shift in range(1, r + 1):
            acc |= np.roll(out, shift, axis=axis)
            acc |= np.roll(out, -shift, axis=axis)
        out = acc
    return out


def write_cog(path: Path, arr: np.ndarray, transform: rasterio.Affine, nodata: float = -9999.0) -> None:
    data = np.where(np.isnan(arr), nodata, arr).astype(np.float32)
    profile = {
        "driver": "COG", "dtype": "float32", "count": 1, "crs": TARGET_CRS, "transform": transform,
        "width": data.shape[1], "height": data.shape[0], "nodata": nodata,
        "compress": "DEFLATE", "predictor": 3, "blocksize": 512, "overview_resampling": "average",
        "num_threads": "ALL_CPUS", "bigtiff": "IF_SAFER",
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data, 1)


def write_mask_cog(path: Path, mask: np.ndarray, transform: rasterio.Affine) -> None:
    profile = {
        "driver": "COG", "dtype": "uint8", "count": 1, "crs": TARGET_CRS, "transform": transform,
        "width": mask.shape[1], "height": mask.shape[0], "nodata": 255,
        "compress": "DEFLATE", "blocksize": 512, "overview_resampling": "nearest", "bigtiff": "IF_SAFER",
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(mask.astype(np.uint8), 1)


def main() -> int:
    if not BEFORE_TILES or not AFTER_TILES:
        print("raw tiles missing; run pipeline/fetch_data.py first")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)

    transform, width, height, bounds = snapped_target_grid(AFTER_TILES)
    print(f"target grid: {width} x {height} cells at {CELL} m, {TARGET_CRS}, bounds {bounds}")

    print("warping before (Tulalip 2013) ...")
    before = warp_epoch(BEFORE_TILES, transform, width, height)
    print("warping after (Snohoco Oso A 2014) ...")
    after = warp_epoch(AFTER_TILES, transform, width, height)
    both = ~np.isnan(before) & ~np.isnan(after)
    print(f"valid cells: before {np.isfinite(before).mean():.1%}, after {np.isfinite(after).mean():.1%}, both {both.mean():.1%}")

    diff = after - before   # NaN wherever either is missing

    # Stable-ground check for bias and noise.
    slope = slope_degrees(np.nan_to_num(before, nan=np.nanmean(before)), CELL)
    big = np.nan_to_num(np.abs(diff), nan=0.0) > BIG_CHANGE_M
    near_big = distance_mask(big, EXCLUDE_NEAR_CHANGE_M, CELL)
    stable = both & (np.abs(diff) < STABLE_MAX_ABS_DIFF_M) & (slope < STABLE_MAX_SLOPE_DEG) & ~near_big
    sd = diff[stable]
    bias = float(np.median(sd))
    nmad = float(1.4826 * np.median(np.abs(sd - bias)))
    print(f"stable ground: {stable.sum():,} cells, median bias {bias:+.3f} m, NMAD {nmad:.3f} m")

    diff_corrected = diff - np.float32(bias)
    after_corrected = after - np.float32(bias)

    lod = level_of_detection(SIGMA95_BEFORE_M, SIGMA95_AFTER_M, nmad)
    print(f"level of detection: {lod['lod_m']:.3f} m (stated {lod['stated_m']:.3f}, empirical {lod['empirical_m']:.3f})")

    # The debris dammed the North Fork Stillaguamish and a lake formed upstream. Lidar sees the
    # lake surface as ground that rose; that is water, not earth, so it is found and set aside.
    pool = find_pool(after_corrected, diff_corrected, lod["lod_m"], CELL)
    water = pool["mask"]
    if pool["found"]:
        print(f"lake surface at {pool['pool_elev_m']:.2f} m NAVD88, {water.sum() * CELL * CELL / 1e4:,.1f} ha")
    water_totals = volume_totals(np.where(water, diff_corrected, np.nan), CELL * CELL, lod["lod_m"])

    totals = volume_totals(diff_corrected, CELL * CELL, lod["lod_m"], exclude=water)
    major = volume_totals(diff_corrected, CELL * CELL, 1.0, exclude=water)
    print(f"earth: cut {totals['cut_m3']:,.0f} m3, fill {totals['fill_m3']:,.0f} m3, net {totals['net_m3']:+,.0f} m3")
    print(f"water: {water_totals['fill_m3']:,.0f} m3 over {water_totals['fill_area_m2'] / 1e4:,.1f} ha")
    print(f"earth area beyond LoD {totals['area_changed_m2'] / 1e4:,.1f} ha; beyond 1 m {major['area_changed_m2'] / 1e4:,.1f} ha")

    print("writing COGs ...")
    write_cog(OUT / "before_m.tif", before, transform)
    write_cog(OUT / "after_m.tif", after_corrected, transform)
    write_cog(OUT / "diff_m.tif", diff_corrected, transform)
    write_mask_cog(OUT / "water_mask.tif", water, transform)

    lonlat = transform_bounds(TARGET_CRS, "EPSG:4326", *bounds, densify_pts=21)
    finite = diff_corrected[np.isfinite(diff_corrected)]
    pct = {f"p{p}": float(np.percentile(finite, p)) for p in (0.1, 1, 5, 50, 95, 99, 99.9)}
    summary = {
        "generated": date.today().isoformat(),
        "crs": TARGET_CRS,
        "cell_m": CELL,
        "grid": {"width": width, "height": height, "bounds_utm": bounds, "bounds_lonlat": lonlat},
        "before": {"name": "Tulalip 2013", "flown": "2013-04-17 to 2013-07-31", "sigma95_m": SIGMA95_BEFORE_M},
        "after": {"name": "Snohoco Oso A 2014", "flown": "2014-03-24", "sigma95_m": SIGMA95_AFTER_M},
        "vertical_bias_removed_m": bias,
        "stable_ground": {"cells": int(stable.sum()), "nmad_m": nmad,
                          "rules": {"max_abs_diff_m": STABLE_MAX_ABS_DIFF_M, "max_slope_deg": STABLE_MAX_SLOPE_DEG,
                                    "exclude_within_m_of_change_over_m": [EXCLUDE_NEAR_CHANGE_M, BIG_CHANGE_M]}},
        "lod": lod,
        "water": {
            "found": pool["found"],
            "pool_elev_m": pool["pool_elev_m"],
            "area_m2": water_totals["fill_area_m2"],
            "volume_m3": water_totals["fill_m3"],
            "mean_depth_m": (water_totals["fill_m3"] / water_totals["fill_area_m2"]) if water_totals["fill_area_m2"] else 0.0,
            "how": "flat cells (slope < 0.3 deg) that gained more than the LoD, clustered within 0.4 m of one elevation",
        },
        "totals": totals,
        "totals_over_1m": major,
        "diff_percentiles_m": pct,
        "max_loss_m": float(np.nanmin(diff_corrected)),
        "max_gain_m": float(np.nanmax(diff_corrected)),
        "notes": [
            "after minus before; negative is loss (cut), positive is gain (fill)",
            "elevations converted from US survey feet with 0.30480060960121924 m/ft",
            "bias measured on stable ground was subtracted from the after surface",
            "volumes and areas count only cells whose change exceeds the level of detection",
            "earth totals exclude the lake surface; its rise is reported separately under water",
            "uncertainty is level of detection times the area it applies to, a conservative linear sum",
        ],
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"wrote {OUT / 'summary.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
