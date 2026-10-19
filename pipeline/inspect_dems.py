"""Step 1 of the pipeline: inspect every raw DEM before touching it.

Prints, for each GeoTIFF under data/raw/dnr/: the coordinate reference system,
linear unit, resolution, size, bounds, data type, nodata value and a sample of
real elevation values. The point is to catch unit and datum surprises before
any differencing happens. A DEM in US survey feet subtracted from one in
meters would be nonsense, and it would still look plausible on a map.

Usage:  python pipeline/inspect_dems.py [folder]
"""
from __future__ import annotations

import sys
from pathlib import Path

import rasterio

ROOT = Path(__file__).resolve().parents[1]


def describe(path: Path) -> dict:
    with rasterio.open(path) as src:
        crs = src.crs
        wkt = crs.to_wkt() if crs else ""
        info = {
            "file": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
            "crs_name": wkt.split('"')[1] if wkt else None,
            "epsg": crs.to_epsg() if crs else None,
            "linear_unit": crs.linear_units if crs else None,
            "has_vertical_crs": "VERT" in wkt,
            "width": src.width,
            "height": src.height,
            "res": src.res,
            "bounds": tuple(round(b, 2) for b in src.bounds),
            "dtype": src.dtypes[0],
            "nodata": src.nodata,
            "tags": src.tags(),
            "compression": str(src.compression),
            "overviews": src.overviews(1),
        }
        # Sample a central window; fall back to a coarse read of the whole raster if it is empty.
        h, w = src.height, src.width
        win = ((max(0, h // 2 - 256), min(h, h // 2 + 256)), (max(0, w // 2 - 256), min(w, w // 2 + 256)))
        arr = src.read(1, window=win, masked=True)
        if arr.count() == 0:
            arr = src.read(1, masked=True, out_shape=(h // 16, w // 16))
        info["sample_min"] = float(arr.min()) if arr.count() else None
        info["sample_max"] = float(arr.max()) if arr.count() else None
        info["sample_valid_fraction"] = float(arr.count() / arr.size)
    return info


def main(argv: list[str]) -> int:
    folder = Path(argv[0]) if argv else ROOT / "data" / "raw" / "dnr"
    tifs = sorted(folder.rglob("*.tif"))
    if not tifs:
        print(f"no GeoTIFFs under {folder}; run pipeline/fetch_data.py first")
        return 1
    for p in tifs:
        d = describe(p)
        print(f"\n{d['file']}")
        print(f"  CRS: {d['crs_name']} (EPSG {d['epsg']}), unit {d['linear_unit']}, "
              f"vertical CRS stored: {d['has_vertical_crs']}")
        print(f"  grid: {d['width']} x {d['height']} at {d['res']}, {d['dtype']}, nodata {d['nodata']}")
        print(f"  bounds: {d['bounds']}")
        print(f"  sample elevations: {d['sample_min']} to {d['sample_max']} "
              f"(valid {d['sample_valid_fraction']:.0%})")
        print(f"  tags: {d['tags']}  compression {d['compression']}  overviews {d['overviews']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
