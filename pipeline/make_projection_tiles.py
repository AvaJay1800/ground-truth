"""Phase 4: terrain tiles for the timeline slider.

The slider scrubs week by week from the March 24, 2014 surface toward the
cleared corridor. The surface in between is a straight interpolation, inside
the SR 530 corridor only:

    surface(f) = after + f * (before - after)        where f = fraction cleared, 0..1

and the 2014 surface everywhere else. That is a projection, not a measurement,
and the app labels it so. Five steps (20, 40, 60, 80, 100 percent) are cut as
full terrain-RGB tile sets so MapLibre can swap the terrain source's tiles;
the slider snaps to the nearest step.

Output: data/derived/tiles/projection/<step>/z/x/y.png          terrain-RGB
        data/derived/tiles/projection-change/<step>/z/x/y.png   classed change, same legend

Usage:  python pipeline/make_projection_tiles.py [--max-zoom 16]
"""
from __future__ import annotations

import argparse
import json
import sys

import mercantile
import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.vrt import WarpedVRT

import make_tiles as mt
from align_and_diff import TARGET_CRS, write_cog

STEPS = [20, 40, 60, 80, 100]


def project_geojson(geom: dict, tf: Transformer) -> dict:
    """Project every coordinate of a Polygon or MultiPolygon GeoJSON geometry."""
    def ring(coords):
        xs, ys = tf.transform([c[0] for c in coords], [c[1] for c in coords])
        return [[float(x), float(y)] for x, y in zip(xs, ys)]
    if geom["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": [ring(r) for r in geom["coordinates"]]}
    if geom["type"] == "MultiPolygon":
        return {"type": "MultiPolygon", "coordinates": [[ring(r) for r in poly] for poly in geom["coordinates"]]}
    raise ValueError(f"unsupported geometry {geom['type']}")


def projected_surfaces() -> list[tuple[int, object]]:
    haul = json.loads((mt.DERIVED / "haul.json").read_text())
    with rasterio.open(mt.DERIVED / "before_m.tif") as b, rasterio.open(mt.DERIVED / "after_m.tif") as a:
        before = b.read(1, masked=True).filled(np.nan)
        after = a.read(1, masked=True).filled(np.nan)
        transform = a.transform
        # The corridor is stored in lon/lat; project its coordinates onto the grid's CRS for
        # the mask. Plain GeoJSON in, plain GeoJSON out; no geometry library needed.
        to_utm = Transformer.from_crs("EPSG:4326", TARGET_CRS, always_xy=True)
        corr = project_geojson(haul["corridor"]["geometry"], to_utm)
        mask = geometry_mask([corr], out_shape=after.shape, transform=transform, invert=True)
    inside = mask & np.isfinite(before) & np.isfinite(after)
    outputs = []
    for step in STEPS:
        f = step / 100
        surf = after.copy()
        surf[inside] = after[inside] + f * (before[inside] - after[inside])
        path = mt.DERIVED / f"after_proj_{step}.tif"
        write_cog(path, surf, transform)
        outputs.append((step, path))
        print(f"step {step}%: wrote {path.name}")
    return outputs


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-zoom", type=int, default=16)
    args = ap.parse_args(argv)

    summary = json.loads((mt.DERIVED / "summary.json").read_text())
    w, s, e, n = summary["grid"]["bounds_lonlat"]
    grid = mt.mercator_grid(w, s, e, n, args.max_zoom)
    vrt_opts = dict(crs="EPSG:3857", resampling=Resampling.bilinear, src_nodata=-9999.0, nodata=-9999.0, **grid)

    before_src = rasterio.open(mt.DERIVED / "before_m.tif")
    before_vrt = WarpedVRT(before_src, **vrt_opts)
    water_src = rasterio.open(mt.DERIVED / "water_mask.tif")
    water_vrt = WarpedVRT(water_src, crs="EPSG:3857", resampling=Resampling.nearest, src_nodata=255, nodata=255, **grid)
    # The change map for each step uses the same classes as the real one, so the legend holds.
    classes = mt.build_classes(summary["lod"]["lod_m"])
    fallback_path = mt.ROOT / "data" / "raw" / "usgs" / "3dep_fallback_10m.tif"
    fallback_src = rasterio.open(fallback_path) if fallback_path.exists() else None
    fallback_vrt = WarpedVRT(fallback_src, **vrt_opts) if fallback_src else None

    count = 0
    for step, path in projected_surfaces():
        with rasterio.open(path) as src, WarpedVRT(src, **vrt_opts) as vrt:
            for z in range(mt.MIN_ZOOM, args.max_zoom + 1):
                for t in mercantile.tiles(w, s, e, n, [z]):
                    surf = mt.read_tile(vrt, t)
                    before = mt.read_tile(before_vrt, t)
                    fallback = mt.read_tile(fallback_vrt, t) if fallback_vrt else np.zeros_like(before)
                    before_filled = np.where(np.isnan(before), fallback, before)
                    filled = np.where(np.isnan(surf), before_filled, surf)
                    img = mt.terrain_rgb(np.nan_to_num(filled, nan=0.0))
                    out = mt.TILES / "projection" / str(step) / str(z) / str(t.x) / f"{t.y}.png"
                    out.parent.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(img, "RGB").save(out, optimize=True)
                    # Projected change: the projected surface minus 2013. Inside the corridor
                    # that is (1 - f) times the real change, so the debris thins as f grows.
                    diff = surf - before
                    rgba = mt.classify(diff, classes)
                    water = mt.read_tile(water_vrt, t, Resampling.nearest)
                    rgba = mt.hatch_water(rgba, np.nan_to_num(water, nan=0) > 0.5)
                    out2 = mt.TILES / "projection-change" / str(step) / str(z) / str(t.x) / f"{t.y}.png"
                    out2.parent.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(rgba, "RGBA").save(out2, optimize=True)
                    count += 1
        print(f"step {step}%: tiles done")
    print(f"projection tiles written: {count}")
    for v in (before_vrt, fallback_vrt, water_vrt):
        if v is not None:
            v.close()
    for s_ in (before_src, fallback_src, water_src):
        if s_ is not None:
            s_.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
