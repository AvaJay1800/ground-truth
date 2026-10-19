"""Fetch a coarse fallback DEM for the edges of the 3D terrain.

The two lidar footprints do not fill the study area's bounding box, and a
terrain-RGB tile cannot be transparent, so without a fallback the 3D view
would drop to sea level outside the surveys and show a cliff. This pulls a
10 m elevation grid for the whole box from the USGS 3DEP image service (The
National Map, public domain) in the pipeline's own CRS. It is used ONLY where
neither lidar survey has data, which is outside the slide, and it is current
3DEP data (the 2016 post-cleanup lidar at Oso), so it is never used for any
difference or volume.

Usage:  python pipeline/fetch_fallback_dem.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "usgs" / "3dep_fallback_10m.tif"
SERVICE = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"

# Slightly larger than the study grid so tiles at every zoom have ground under them.
BBOX_UTM = (581000, 5344000, 590000, 5352000)
RES_M = 10


def main() -> int:
    w, s, e, n = BBOX_UTM
    params = {
        "bbox": f"{w},{s},{e},{n}", "bboxSR": 26910, "imageSR": 26910,
        "size": f"{(e - w) // RES_M},{(n - s) // RES_M}",
        "format": "tiff", "pixelType": "F32", "noData": -9999,
        "interpolation": "RS_BilinearInterpolation", "f": "image",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(SERVICE, params=params, timeout=300)
    r.raise_for_status()
    if not r.content.startswith(b"II*\x00") and not r.content.startswith(b"MM\x00*"):
        print("service did not return a TIFF:", r.content[:200])
        return 1
    OUT.write_bytes(r.content)
    print(f"wrote {OUT.relative_to(ROOT)} ({len(r.content) / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
