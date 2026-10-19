# Build log

Dated notes on what was built, what went wrong, what I learned, and one clip-worthy moment per phase.

## 2026-10-19 — Phase 1: core change viewer

**Built**

- `pipeline/align_and_diff.py`: both DEMs warped onto one 1 m grid in UTM 10N, feet to meters with the US survey foot, clipped to the study area and the 2014 footprint, differenced, checked against each other on stable ground, lake detected and masked, written as cloud-optimized GeoTIFFs plus `summary.json`. Runs in about 45 seconds.
- `pipeline/lod.py`: level of detection, volume totals and lake detection as plain functions with nine pytest cases.
- `pipeline/make_tiles.py`: terrain-RGB tiles for both epochs, classed change tiles with hatched water, `legend.json` so the app's legend reads the same breaks the tiles were painted with. 683 PNGs, 15 MB.
- App: two synced MapLibre maps with a swipe; hillshade from the terrain tiles; change layer; polygon volume tool (Terra Draw plus geotiff.js reading the difference COG and the water mask by HTTP range); cursor readout of lat/long, both elevations and the change; About panel; light and dark; units toggle. Eighteen vitest cases for units, UTM and polygon volume.

**Problems hit**

- Net change came out +3.2 million m³ on the first run. A landslide should roughly balance. The map showed why: the river backed up behind the debris and lidar read the new lake surface as several meters of "gain" over 150 ha. The pipeline now finds the pond as the one elevation a large flat area of gain shares, masks it, hatches it on the map and reports water separately. Earth totals then balance within 10 percent.
- The lake mask first shrank to 67 ha because per-cell noise makes flat water look like it tilts a degree. Slope is now measured on a 5 m block average.
- Stable ground disagreed by 8 cm NMAD, more than the vendors' 5 cm. So the level of detection is 16 cm, not the 7.6 cm the reports imply. Using the measured figure is the honest choice and the About panel says so.
- Vite pre-bundling broke MapLibre's web worker (excluded from optimizeDeps); MapLibre's own CSS sets `position: relative` on the map container, which zeroed the map height until the rule was made more specific; Vite's SPA fallback was answering missing tiles with index.html, which MapLibre tried to decode as PNGs.
- The desktop app's preview launcher kept starting the old portfolio dev server instead of this project's launch config, so the Vite server was started directly for verification.

**Learned**

- "Change" on a difference map is not all earth. Water, snow and vegetation classification differences all show up as elevation change. A pipeline has to say what it counted.
- A measured level of detection beats a quoted one. Stable ground is the control group.
- Terrain-RGB cannot be transparent, so missing after-survey cells at the edges are filled with the 2013 surface; this is outside the slide and is documented.

**Clip-worthy moment**

The first difference map had a bright orange tongue stretching two kilometers east of the slide. It looked like debris. It was the lake: the river had been dammed for two days when the plane flew, and the water surface, flat at 89.3 m, read as 2.8 m of "fill" across 133 hectares. One histogram spike found it. That is the whole point of looking at the map before trusting the number.

**Assumed**

- Basemaps: OpenFreeMap Positron (vector, no key) and USGS National Map imagery (public domain, no key). Both are free for this use; confirm you are happy with them.
- Lake detection rules: flat means under 0.3 degrees on a 5 m block average; the pool is the modal elevation in 0.2 m bins; mask within 0.4 m of it and under 1 degree.
- Volume uncertainty is the level of detection summed linearly over counted cells, the cautious convention.

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
