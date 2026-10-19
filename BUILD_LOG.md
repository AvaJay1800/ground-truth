# Build log

Dated notes on what was built, what went wrong, what I learned, and one clip-worthy moment per phase.

## 2026-10-19 — Phase 0: data, environment, scaffold

**Built**

- Repo skeleton: `pipeline/` (Python), `app/` (Vite + Preact + TypeScript, with MapLibre GL, Terra Draw, geotiff.js, Preact signals and vitest installed), `data/raw` and `data/derived` (gitignored), `docs/`.
- `pipeline/fetch_data.py`: re-runnable download of the Oso-area tiles from the Washington Lidar Portal, using the same three endpoints the portal's own map uses.
- `pipeline/inspect_dems.py`: step 1 of the data-quality pipeline, prints CRS, units, resolution, nodata and sample elevations for every raw DEM.
- `DATA_SOURCES.md` with every dataset name, date, datum, unit and accuracy figure, each tied to the report or file it came from.

**Problems hit**

- The portal is a JavaScript app with no documented API. Reading its page script showed `GET /project`, `POST /query` and `GET /download`, and that downloads 403 without a session cookie from the home page.
- The portal's metadata downloads for Oso A and Oso C are empty zips. The 2014 report arrived attached to Oso B instead, and it covers the March 24 flight too. Oso C has no report anywhere I could find, so its date is inferred from the LAZ file header (created 2014-06-30) and GPS week-seconds (a Saturday afternoon), consistent with the June 21, 2014 re-flight NV5 describes publicly. It is kept as an optional third epoch, labeled as inferred.
- The USGS 1 m DEM for this area is "WA Western North 2016", flown after the cleanup. Good fallback, wrong moment for the story.
- pdf text extraction choked on Windows cp1252 output. Fixed by reconfiguring stdout to UTF-8, not by stripping the characters.

**Learned**

- Both vendor reports say State Plane North in US survey feet, but the portal serves everything in State Plane South. Always inspect the file, not just the report. The two agree on units (feet) and vertical datum (NAVD88), which is what matters for subtraction, but they used different geoid models (GEOID03 in 2013, GEOID12A in 2014), so a few centimeters of systematic offset is possible and must be checked on stable ground.
- LAS files store GPS time as seconds of the GPS week unless a header flag says otherwise. Alone it gives the weekday and time, not the date. Paired with the file creation date and the report's delivery note it was enough to pin the March 24 flight to Oso A.
- Level of detection for this pair: sqrt(0.054^2 + 0.054^2) = 7.6 cm (about 3 inches). Anything smaller than that is noise and the app will say so.

**Clip-worthy moment**

The vendor's 2014 report says "Initial LiDAR data were acquired on Monday, March 24th" and "delivered on March 28th." The portal didn't say which of its three Oso projects that was. The answer was sitting in the point cloud itself: the file header says created 2014-03-28, and the GPS week-seconds land on a Monday afternoon. Data forensics with a two-line Python script.

**Assumed**

- The study area polygon (lon -121.90 to -121.80, lat 48.25 to 48.31) is wide enough for the slide, the SR 530 corridor and enough stable ground to check the two surfaces against each other. Adjust in `pipeline/fetch_data.py` if not.
- The portal's reprojection to State Plane South did not change vertical units. Sample elevations (about 290 to 440 ft on the valley floor and lower slopes) agree with USGS topo values for the Oso valley.
