"""Fetch the raw elevation data for Ground Truth from the Washington Lidar Portal.

The portal (https://lidarportal.dnr.wa.gov) is a Leaflet app with three plain
endpoints that its own page script uses:

  GET  /project                              list of projects and dataset ids
  POST /query     geojson=<Polygon>          files and bytes per dataset in a polygon
  GET  /download?geojson=<Polygon>&ids=<id>  zip of the files that intersect it

Downloads need a session cookie from the home page first; without it the
server answers 403. Everything lands in data/raw/, which is gitignored.

Usage (from the repo root, inside the venv):
  python pipeline/fetch_data.py            # DTMs and metadata for the study area
  python pipeline/fetch_data.py --list     # just print what the portal has here
"""
from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path

import requests

PORTAL = "https://lidarportal.dnr.wa.gov"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ground-truth-pipeline/0.1"
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"

# Study area: the slide, the SR 530 corridor and the valley either side.
# WGS84 lon/lat, roughly 7.4 km east-west by 6.7 km north-south.
STUDY_AREA = {
    "type": "Polygon",
    "coordinates": [[
        [-121.90, 48.25], [-121.80, 48.25], [-121.80, 48.31],
        [-121.90, 48.31], [-121.90, 48.25],
    ]],
}

# Portal dataset ids, confirmed 2026-10-19 from GET /project. See DATA_SOURCES.md.
DATASETS = {
    # key:            (dataset id, portal project, product)
    "before_dtm":     (43,  "Tulalip 2013",        "DTM"),
    "before_meta":    (241, "Tulalip 2013",        "Metadata"),
    "after_a_dtm":    (32,  "Snohoco Oso A 2014",  "DTM"),
    "after_b_dtm":    (595, "Snohoco Oso B 2014",  "DTM"),
    "after_b_meta":   (599, "Snohoco Oso B 2014",  "Metadata"),
    "after_c_dtm":    (33,  "Snohoco Oso C 2014",  "DTM"),
    "stilly_meta":    (236, "Stillaguamish 2014",  "Metadata"),
}


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Referer": PORTAL + "/"})
    s.get(PORTAL + "/", timeout=60).raise_for_status()  # sets the cookie
    return s


def list_area(s: requests.Session) -> list[dict]:
    r = s.post(PORTAL + "/query", data={"geojson": json.dumps(STUDY_AREA)}, timeout=120)
    r.raise_for_status()
    return r.json()


def download(s: requests.Session, dataset_id: int, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"  have {dest.name}, skipping")
        return dest
    with s.get(
        PORTAL + "/download",
        params={"geojson": json.dumps(STUDY_AREA), "ids": dataset_id},
        stream=True, timeout=1800,
    ) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    size = dest.stat().st_size
    print(f"  {dest.name}: {size / 1e6:.1f} MB")
    if size < 100:
        print("  WARNING: tiny zip, the portal has no files for this id in the study area")
    return dest


def extract(zip_path: Path) -> list[Path]:
    out_dir = zip_path.with_suffix("")
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(out_dir)
        return [out_dir / n for n in z.namelist()]


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true", help="only list datasets in the study area")
    ap.add_argument("--only", nargs="*", choices=sorted(DATASETS), help="subset of keys to fetch")
    args = ap.parse_args(argv)

    s = session()
    rows = list_area(s)
    wanted = {v[0] for v in DATASETS.values()}
    print(f"{len(rows)} datasets intersect the study area; the ones this project uses:")
    for row in sorted(rows, key=lambda r: r["project_name"]):
        if row["dataset_id"] in wanted:
            print(f"  {row['dataset_id']:5}  {row['project_name']:24} {row['dataset_name']:10} "
                  f"{row['files']:3} files  {row['bytes'] / 1e6:8.1f} MB")
    if args.list:
        return 0

    for key, (dataset_id, project, product) in DATASETS.items():
        if args.only and key not in args.only:
            continue
        print(f"\n{key}: {project} / {product} (id {dataset_id})")
        is_meta = product == "Metadata"
        sub = "dnr_meta" if is_meta else "dnr"
        prefix = "meta" if is_meta else "dtm"
        zp = download(s, dataset_id, RAW / sub / f"{prefix}_{dataset_id}.zip")
        if zp.stat().st_size > 100:
            for p in extract(zp):
                print(f"    -> {p.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
