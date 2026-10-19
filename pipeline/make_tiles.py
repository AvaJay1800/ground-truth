"""Step 6 of the pipeline: web tiles for MapLibre.

Three tile sets, all 256 px PNGs in the usual z/x/y Web Mercator scheme:

  tiles/before/   terrain-RGB elevation of the 2013 surface
  tiles/after/    terrain-RGB elevation of the 2014 surface
  tiles/change/   color-relief of the difference, classed, with a gray
                  "no detectable change" class and transparent no-data

Terrain-RGB packs an elevation into three color channels so a browser can
decode it: height = -10000 + (R * 65536 + G * 256 + B) * 0.1. That gives
0.1 m steps from -10,000 m up, which is plenty for hillshade and 3D terrain.
MapLibre cannot leave holes in a terrain tile, so where the 2014 flight has no
data we fill with the 2013 surface; that only happens at the edges of the
study area, outside the slide.

The change classes and colors are written to legend.json so the app's legend
reads the same numbers the tiles were painted with.

Usage:  python pipeline/make_tiles.py [--max-zoom 16]
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import mercantile
import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[1]
DERIVED = ROOT / "data" / "derived"
TILES = DERIVED / "tiles"
TILE_PX = 256
MIN_ZOOM = 10

FT = 0.3048006096012192  # US survey foot in meters

# Change classes, from most loss to most gain. Breaks are in meters but chosen on
# round feet, since the app shows feet by default. Blue for loss, orange for gain,
# both color-blind safe as a pair; no red or green anywhere.
LOSS_BREAKS_FT = [100, 50, 20, 5]
GAIN_BREAKS_FT = [5, 20, 50]
LOSS_COLORS = ["#08306b", "#2166ac", "#4393c3", "#92c5de", "#d1e5f0"]   # darkest first
GAIN_COLORS = ["#fee0b6", "#fdb863", "#e08214", "#b35806"]               # lightest first
NONE_COLOR = "#bdbdbd"
NONE_ALPHA = 115   # out of 255; the gray class is deliberately quieter than the change classes


def hex_rgb(h: str) -> tuple[int, int, int]:
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def build_classes(lod_m: float) -> list[dict]:
    """Ordered list of classes with [lower, upper) bounds in meters, colors and labels in both units."""
    classes = []
    loss_breaks = [-b * FT for b in LOSS_BREAKS_FT] + [-lod_m]   # -30.48, -15.24, -6.10, -1.52, -lod
    bounds = [-np.inf] + loss_breaks
    for i, color in enumerate(LOSS_COLORS):
        lo, hi = bounds[i], bounds[i + 1]
        classes.append({"kind": "loss", "min_m": None if lo == -np.inf else lo, "max_m": hi, "color": color, "alpha": 255})
    classes.append({"kind": "none", "min_m": -lod_m, "max_m": lod_m, "color": NONE_COLOR, "alpha": NONE_ALPHA})
    gain_breaks = [lod_m] + [b * FT for b in GAIN_BREAKS_FT] + [np.inf]
    for i, color in enumerate(GAIN_COLORS):
        lo, hi = gain_breaks[i], gain_breaks[i + 1]
        classes.append({"kind": "gain", "min_m": lo, "max_m": None if hi == np.inf else hi, "color": color, "alpha": 255})
    for c in classes:
        c["label_ft"] = label(c, 1 / FT, "ft", lod_m)
        c["label_m"] = label(c, 1.0, "m", lod_m)
    return classes


def label(c: dict, k: float, unit: str, lod_m: float) -> str:
    def fmt(v: float) -> str:
        v = abs(v) * k
        return f"{v:.2g}" if v < 1 else f"{v:.0f}"
    if c["kind"] == "none":
        return f"no detectable change (within {fmt(lod_m)} {unit})"
    lo, hi = c["min_m"], c["max_m"]
    if c["kind"] == "loss":
        if lo is None:
            return f"more than {fmt(hi)} {unit} lower"
        return f"{fmt(hi)} to {fmt(lo)} {unit} lower"
    if hi is None:
        return f"more than {fmt(lo)} {unit} higher"
    return f"{fmt(lo)} to {fmt(hi)} {unit} higher"


def classify(diff: np.ndarray, classes: list[dict]) -> np.ndarray:
    """RGBA uint8 image for a difference window; NaN stays transparent."""
    h, w = diff.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    valid = np.isfinite(diff)
    for c in classes:
        lo = -np.inf if c["min_m"] is None else c["min_m"]
        hi = np.inf if c["max_m"] is None else c["max_m"]
        sel = valid & (diff >= lo) & (diff < hi)
        r, g, b = hex_rgb(c["color"])
        rgba[sel] = (r, g, b, c["alpha"])
    return rgba


HATCH_PERIOD = 10   # tile pixels between diagonal stripes
HATCH_WIDTH = 3
HATCH_COLOR = (255, 255, 255, 235)


def hatch_water(rgba: np.ndarray, water: np.ndarray) -> np.ndarray:
    """Overlay diagonal white stripes where a lake surface was detected, so the class
    is readable without relying on color. Stripes are in tile pixels, so they stay the
    same size on screen at every zoom."""
    h, w = water.shape
    yy, xx = np.mgrid[0:h, 0:w]
    stripes = ((xx + yy) % HATCH_PERIOD) < HATCH_WIDTH
    sel = water & stripes & (rgba[..., 3] > 0)
    rgba[sel] = HATCH_COLOR
    return rgba


def terrain_rgb(elev: np.ndarray) -> np.ndarray:
    v = np.round((elev + 10000.0) / 0.1).astype(np.int64)
    v = np.clip(v, 0, 256 ** 3 - 1)
    out = np.empty((*elev.shape, 3), dtype=np.uint8)
    out[..., 0] = (v >> 16) & 255
    out[..., 1] = (v >> 8) & 255
    out[..., 2] = v & 255
    return out


def mercator_grid(w: float, s: float, e: float, n: float, max_zoom: int) -> dict:
    """A Web Mercator grid at max_zoom resolution covering every tile we will cut, so the
    WarpedVRT always contains each tile window (WarpedVRT refuses boundless reads)."""
    tiles = list(mercantile.tiles(w, s, e, n, [MIN_ZOOM]))
    xs = [mercantile.xy_bounds(t) for t in tiles]
    left, bottom = min(b.left for b in xs), min(b.bottom for b in xs)
    right, top = max(b.right for b in xs), max(b.top for b in xs)
    res = 2 * math.pi * 6378137 / (TILE_PX * 2 ** max_zoom)
    width = int(round((right - left) / res))
    height = int(round((top - bottom) / res))
    return {"transform": from_origin(left, top, res, res), "width": width, "height": height}


def read_tile(vrt: WarpedVRT, tile: mercantile.Tile, resampling: Resampling = Resampling.bilinear) -> np.ndarray:
    b = mercantile.xy_bounds(tile)
    win = from_bounds(b.left, b.bottom, b.right, b.top, transform=vrt.transform)
    arr = vrt.read(1, window=win, out_shape=(TILE_PX, TILE_PX), resampling=resampling, masked=True)
    return arr.astype(np.float32).filled(np.nan)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max-zoom", type=int, default=16)
    args = ap.parse_args(argv)

    summary = json.loads((DERIVED / "summary.json").read_text())
    lod_m = summary["lod"]["lod_m"]
    classes = build_classes(lod_m)
    w, s, e, n = summary["grid"]["bounds_lonlat"]

    grid = mercator_grid(w, s, e, n, args.max_zoom)
    vrt_opts = dict(crs="EPSG:3857", resampling=Resampling.bilinear, src_nodata=-9999.0, nodata=-9999.0, **grid)
    srcs = {k: rasterio.open(DERIVED / f"{k}_m.tif") for k in ("before", "after", "diff")}
    vrts = {k: WarpedVRT(v, **vrt_opts) for k, v in srcs.items()}
    water_src = rasterio.open(DERIVED / "water_mask.tif")
    water_vrt = WarpedVRT(water_src, crs="EPSG:3857", resampling=Resampling.nearest, src_nodata=255, nodata=255, **grid)
    # Coarse USGS 3DEP grid, used only where neither lidar survey has data (see fetch_fallback_dem.py).
    fallback_path = ROOT / "data" / "raw" / "usgs" / "3dep_fallback_10m.tif"
    fallback_src = rasterio.open(fallback_path) if fallback_path.exists() else None
    fallback_vrt = WarpedVRT(fallback_src, **vrt_opts) if fallback_src else None
    if not fallback_vrt:
        print("no fallback DEM; terrain outside the surveys will sit at sea level (run fetch_fallback_dem.py)")

    counts = {"before": 0, "after": 0, "change": 0}
    for z in range(MIN_ZOOM, args.max_zoom + 1):
        tiles = list(mercantile.tiles(w, s, e, n, [z]))
        for t in tiles:
            before = read_tile(vrts["before"], t)
            after = read_tile(vrts["after"], t)
            diff = read_tile(vrts["diff"], t)
            # Every candidate tile is written, even where only the fallback has data, so the
            # browser never asks for a tile inside the advertised bounds and gets a 404.
            # Terrain tiles can't be transparent. Where a survey has no data: the 2014 surface
            # borrows the 2013 one, and both borrow the coarse USGS grid. Both cases are outside
            # the slide; the fallback is the last resort instead of a sea-level cliff.
            fallback = read_tile(fallback_vrt, t) if fallback_vrt else np.zeros_like(before)
            before_filled = np.where(np.isnan(before), fallback, before)
            after_filled = np.where(np.isnan(after), before_filled, after)
            for name, elev in (("before", before_filled), ("after", after_filled)):
                img = terrain_rgb(np.nan_to_num(elev, nan=0.0))
                out = TILES / name / str(z) / str(t.x) / f"{t.y}.png"
                out.parent.mkdir(parents=True, exist_ok=True)
                Image.fromarray(img, "RGB").save(out, optimize=True)
                counts[name] += 1
            rgba = classify(diff, classes)
            water = read_tile(water_vrt, t, Resampling.nearest)
            rgba = hatch_water(rgba, np.nan_to_num(water, nan=0) > 0.5)
            # Always write the change tile, even when fully transparent, so the browser
            # never logs a 404 for a tile inside the advertised bounds.
            out = TILES / "change" / str(z) / str(t.x) / f"{t.y}.png"
            out.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(rgba, "RGBA").save(out, optimize=True)
            counts["change"] += 1
        print(f"zoom {z}: {len(tiles)} candidate tiles")

    legend = {
        "lod_m": lod_m,
        "encoding": {"terrain": "mapbox-terrain-rgb", "base": -10000, "interval": 0.1},
        "zoom": {"min": MIN_ZOOM, "max": args.max_zoom},
        "bounds_lonlat": [w, s, e, n],
        "classes": classes,
        "water": {
            "pool_elev_m": summary["water"]["pool_elev_m"],
            "pattern": "diagonal white stripes over the gain color",
            "label": "lake that formed behind the debris (water surface, not earth)",
        },
    }
    (DERIVED / "legend.json").write_text(json.dumps(legend, indent=2))
    for v in list(vrts.values()) + [water_vrt, fallback_vrt]:
        if v is not None:
            v.close()
    for s_ in list(srcs.values()) + [water_src, fallback_src]:
        if s_ is not None:
            s_.close()
    print("tiles written:", counts)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
