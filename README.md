# Ground Truth

Seeing the invisible change. A web demo that compares two bare-earth elevation surveys of the same valley near Oso, Washington, one flown in 2013 and one flown two days after the March 22, 2014 landslide, shows what moved and how much, explains it in plain language, and turns the change into an earthwork plan: trucks, haul routes, weeks, weather.

Forty-three people died at Oso. The demo is about understanding the land, and it is built to be respectful and factual. See `DATA_SOURCES.md` for where every number comes from.

Status: Phase 4 (change viewer, 3D, summary, cleanup planner, and the schedule: calendar, weather, week chart, what-ifs, timeline slider). Phase 5 (polish and publish) remains; see `BUILD_LOG.md`.

## Layout

```
pipeline/     Python. Fetch, inspect, align, difference, threshold, tile, summarize.
app/          Vite + Preact + TypeScript. MapLibre GL map, swipe, 3D, volume tool.
data/raw/     Downloads (gitignored). data/derived/ holds COGs, tiles, summary.json.
DATA_SOURCES.md   Datasets, dates, datums, units, accuracy, with citations.
BUILD_LOG.md      Dated build notes.
```

## Run the pipeline

Windows, Python 3.12. The rasterio wheel bundles GDAL, so nothing else to install.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r pipeline/requirements.txt
.venv/Scripts/python pipeline/fetch_data.py          # ~850 MB of DTM tiles from the Washington Lidar Portal
.venv/Scripts/python pipeline/inspect_dems.py        # step 1: CRS, units, resolution, nodata
.venv/Scripts/python pipeline/align_and_diff.py      # steps 2-5: one grid, meters, difference, LoD, lake, COGs, summary.json
.venv/Scripts/python pipeline/fetch_fallback_dem.py  # 10 m USGS grid for terrain edges outside both surveys (3D only)
.venv/Scripts/python pipeline/make_tiles.py          # step 6: terrain-RGB and change tiles, legend.json
.venv/Scripts/python pipeline/haul_prep.py           # what-if cleanup: corridor volumes, pits, routes (calls OSRM once)
.venv/Scripts/python pipeline/climate_prep.py --noaa-station USC00451992   # monthly climate normals, NOAA cross-check
.venv/Scripts/python pipeline/make_projection_tiles.py                      # terrain tiles for the timeline slider
.venv/Scripts/python -m pytest pipeline/tests        # math tests
```

Outputs land in `data/derived/`: three cloud-optimized GeoTIFFs in meters (before, after, difference), a water mask, `summary.json`, `legend.json` and about 700 PNG tiles.

## Run the app

```bash
cd app
npm install
npm run dev
```

In development the Vite config serves `../data/derived` at `/data` with HTTP range support, so the browser reads the GeoTIFFs in pieces. Tests: `npx vitest run`.

## Deploy

The app builds with a base path of `/demos/ground-truth/` and is copied into the daviddonnell.com site repo under `demos/ground-truth/`. Tiles and cloud-optimized GeoTIFFs are served from Cloudflare R2. Details in Phase 5.
