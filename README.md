# Ground Truth

Seeing the invisible change. A web demo that compares two bare-earth elevation surveys of the same valley near Oso, Washington, one flown in 2013 and one flown two days after the March 22, 2014 landslide, shows what moved and how much, explains it in plain language, and turns the change into an earthwork plan: trucks, haul routes, weeks, weather.

Forty-three people died at Oso. The demo is about understanding the land, and it is built to be respectful and factual. See `DATA_SOURCES.md` for where every number comes from.

Status: Phase 0 (data verified and downloaded, repo scaffolded). Phases 1 to 5 are listed in `BUILD_LOG.md`.

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
.venv/Scripts/python pipeline/fetch_data.py --list
.venv/Scripts/python pipeline/fetch_data.py
.venv/Scripts/python pipeline/inspect_dems.py
```

`fetch_data.py` pulls about 850 MB of DTM tiles for the study area from the Washington Lidar Portal. Later steps (align, difference, tiles) arrive in Phase 1.

## Run the app

```bash
cd app
npm install
npm run dev
```

## Deploy

The app builds with a base path of `/demos/ground-truth/` and is copied into the daviddonnell.com site repo under `demos/ground-truth/`. Tiles and cloud-optimized GeoTIFFs are served from Cloudflare R2. Details in Phase 5.
