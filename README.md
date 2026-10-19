# Ground Truth

**Seeing the invisible change.** A web demo that compares two bare-earth lidar surveys of the valley near Oso, Washington, one flown in the summer of 2013 and one flown on March 24, 2014, two days after the landslide, shows what moved and how much, explains it in plain language, and turns the change into an earthwork plan: trucks, haul routes, weeks, weather.

Forty-three people died at Oso on March 22, 2014. This project is about understanding the ground. It is built to be respectful and factual, and every number in it traces to a source or a stated assumption. See [DATA_SOURCES.md](DATA_SOURCES.md).

Live: `https://daviddonnell.com/demos/ground-truth/` (see Deploy, below).

## Why I built it

I spent years designing software for civil and construction work. Cut and fill, haul cycles and weather days are the daily arithmetic of a job site. I wanted to feel the geospatial side of that arithmetic with my own hands, on real data, before an interview for a product built on photogrammetry, GIS and drone imagery, and to share the build in public. [BUILD_LOG.md](BUILD_LOG.md) has one dated entry per phase with what went wrong and what I learned.

## What it does

| Part | What you can do |
|---|---|
| Before / after | Swipe between the 2013 and 2014 hillshades. Hover for lat/long, both elevations and the change. |
| What changed | A classed change map, blue for loss and orange for gain, gray within the level of detection, hatched where a lake formed. Draw a polygon for cut, fill, net, area and an uncertainty range. |
| 3D | Terrain from either survey with the change colors draped on it. |
| Plan a cleanup | A what-if: clear the SR 530 corridor back to its 2013 grade. Balance, swell and shrink, truck loads, two permitted pits, real road routes, cycle time, fleet and days. Every factor editable, every default sourced. |
| Schedule | A calendar with weekends, shifts, daylight and thirty years of weather. A week chart, a finish date, what-ifs, a climate strip, and a timeline slider that moves the terrain. |
| About this data | Sources, dates, datums, accuracy and limitations in plain language. |

The headline, with the defaults: about 6.5 million cubic yards of hillside came down and about 6.0 million came to rest on the valley floor; clearing the highway corridor would take about 7,100 truckloads and, with eight articulated trucks on ten-hour days from April, finish in early August with about fifteen days lost to rain.

## Layout

```
pipeline/     Python. Fetch, inspect, align, difference, threshold, tile, haul, climate, projection, upload.
app/          Vite + Preact + TypeScript. MapLibre GL, Terra Draw, geotiff.js. Math in src/math, tested.
data/raw/     Downloads (gitignored). data/derived/ holds COGs, tiles, JSON (gitignored, uploaded to R2).
DATA_SOURCES.md   Datasets, dates, datums, units, accuracy, sites, trucks, climate, with citations.
BUILD_LOG.md      Dated build notes, one entry per phase.
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

Outputs land in `data/derived/`: three cloud-optimized GeoTIFFs in meters (before, after, difference), a water mask, `summary.json`, `legend.json`, `haul.json`, `climate.json`, and about 2,800 PNG tiles.

## Run the app

```bash
cd app
npm install
npm run dev
```

In development the Vite config serves `../data/derived` at `/data` with HTTP range support, so the browser reads the GeoTIFFs in pieces. Tests: `npx vitest run` (units, UTM, polygon volume, summary text, haul, schedule). Typecheck: `npx tsc -p tsconfig.app.json --noEmit`.

## Deploy

The app is a static build served under `daviddonnell.com/demos/ground-truth/`; the data lives in a Cloudflare R2 bucket.

1. Create an R2 bucket, enable public access (an `r2.dev` URL or a custom domain), and make an API token with object read and write. Copy `.env.example` to `.env` and fill it in.
2. `.venv/Scripts/python pipeline/upload_r2.py` uploads `data/derived` (about 160 MB). Re-runs only send changed files. It also tries to set CORS; an Object Read & Write token cannot, so in that case set this rule once in the dashboard (bucket, Settings, CORS Policy):

   ```json
   [{"AllowedOrigins": ["https://daviddonnell.com", "https://www.daviddonnell.com", "http://localhost:5173", "http://127.0.0.1:5173"],
     "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["Range", "Content-Type"],
     "ExposeHeaders": ["Content-Range", "Content-Length", "Accept-Ranges", "ETag"], "MaxAgeSeconds": 86400}]
   ```
3. `cd app && node scripts/publish.mjs --site <path to the daviddonnell-ai checkout> --data https://<bucket public host>/oso` builds with the production data URL and copies the build into that repo's `demos/ground-truth/`, adding cache and service-worker headers to its `_headers`.
4. Commit and push the site repo. Cloudflare Pages deploys from `main`.

The live app never holds a key: the summary text is a template over the pipeline's JSON, routes were fetched once by the pipeline, and the climate data is a static file.

## Assumptions and limitations, in short

- The level of detection is 0.162 m (0.53 ft), measured on stable ground, larger than the surveys' stated 0.054 m each because of forest and resampling. Smaller changes are shown as none.
- The lake that formed behind the debris is detected as a flat surface at one elevation and kept out of earth volumes. Lidar does not see the ground under it.
- Both surveys are NAVD88 but through different geoid models; a 3 cm bias was measured and removed.
- The cleanup is a teaching scenario. The real reconstruction raised SR 530 on the debris. Sites are the nearest permitted pits; nothing says they were used in 2014.
- Shrink factors, load and dump times, the highway truck's payload and the weather loss rules are assumptions, labeled as such in the app and editable.
- Climate counts come from reanalysis, which runs about 20 percent wetter than the Darrington gauge; the schedule is therefore cautious.
- The timeline interpolates the corridor surface uniformly between the 2014 ground and the 2013 grade. It is a projection, labeled as one.
- Drawing a polygon needs a pointer; everything else is keyboard-accessible. Change classes are also hatched or labeled so color is never the only cue.

Full detail in [DATA_SOURCES.md](DATA_SOURCES.md).

## Credits

Lidar: Puget Sound LiDAR Consortium (2013, flown by Watershed Sciences) and WSDOT (2014, flown by Quantum Spatial), both via the Washington State Department of Natural Resources Lidar Portal. Fallback terrain: USGS 3DEP. Roads: OpenStreetMap. Routing: OSRM. Pits: Washington DNR surface mine permits. Climate: Open-Meteo (ERA5) and NOAA NCEI normals. Basemap: OpenFreeMap. Imagery: USGS The National Map.
