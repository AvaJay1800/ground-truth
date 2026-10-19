# Build log

Dated notes on what was built, what went wrong, what I learned, and one clip-worthy moment per phase.

## 2026-10-19 — Phase 3: earthwork logistics (mass haul)

**Built**

- `pipeline/haul_prep.py`: the what-if scope (SR 530, 30 m either side of the OpenStreetMap centerline, through the slide), its bank volumes from the Phase 1 difference grid, two candidate sites from Washington DNR's public register of permitted pits, and four road routes fetched once from the public OSRM demo server and stored in `haul.json`. The live app never calls OSRM.
- `app/src/math/haul.ts`: balance (reuse first, surplus to disposal, deficit from borrow, with compaction applied), swell and shrink, payload-or-volume truck loads, cycle time, loader-saturation fleet size, and a day planner that is honest about whether the loader or the fleet is the bottleneck. Ten vitest cases.
- "Plan a cleanup" tab: six numbered steps, every factor shown and editable, every default with its source line underneath. Corridor, routes and pits drawn on the map; opening the tab frames them.
- `app/src/content/haulDefaults.ts`: Caterpillar's loose and bank densities (so swell is a ratio of two cited numbers), Cat 745 payload and heaped capacity from cat.com, an Ox Bodies Stampede 16 ft body for the highway truck. Shrink factors, payload for the highway truck, load and dump times, the speed factor and the 50-minute hour are labeled as assumptions.

**Problems hit**

- cat.com refuses plain HTTP clients; the density table was read through the browser pane and transcribed. Ox Bodies publishes a capacity range per body line, not a per-length table on the page, so the 16 ft figure is stated as an interpretation of that range.
- Shrink (compacted ÷ bank) is not in the Caterpillar table. Rather than cite a number I could not verify, the defaults are marked "assumed" in the UI and here. An Iowa DOT shrinkage report from 1969 exists but its scan did not yield a clean figure.
- MapLibre's `isStyleLoaded()` is false during any pending style change, which silently skipped adding the haul layers. The gate is now "does the terrain source exist."
- Zero volumes printed as "0.0" in the balance; fixed in the formatter with a test.

**Learned**

- Balance first, then trucks. Reusing debris to restore lost ground is tiny here (about 9,000 yd³ of 198,000) because a landslide deposit is almost all surplus; a highway cut-and-fill job is the opposite.
- Loaded trucks are limited by weight before volume for wet earth in a Cat 745: 41 t at 1.6 t/m³ is 25.6 m³, just under the 26 m³ body. The panel says which limit bit.
- Every pace number has a loader behind it. With eight trucks the fleet is the limit; past nine, trucks queue and the only way to go faster is a second loader.

**Clip-worthy moment**

The corridor holds about 198,000 cubic yards of debris. In a Cat 745 that is 7,100 truckloads, each a 41-minute round trip to the nearest permitted pit. Eight trucks, ten-hour days: 73 working days. Twenty trucks: 30 days. The numbers are a what-if, but every input is on screen with its source, and you can change any of them.

**Assumed**

- The scope is a 100 ft corridor cleared back to the 2013 grade. The real reconstruction raised the highway on the debris instead; this is a teaching scenario and the panel says so.
- Site choice: nearest permitted pits east and west of the slide. Neither is known to have been used in 2014.
- Routes are car routes on today's roads; trucks are slowed by a 0.8 factor (0.9 for highway trucks). Empty return at car speed.

## 2026-10-19 — Phase 2: 3D and the plain-English summary

**Built**

- 3D mode: MapLibre terrain on the "after" map, built from either survey (a hidden copy of the 2013 terrain source rides along on the same map), with the change colors draped on the surface, a vertical exaggeration choice (1, 1.3, 2) and a sky so the tilted view has a horizon. Entering 3D tilts the camera; leaving it flattens the map again.
- Plain-English summary at the top of the page, with a "More, and how we know" fold. It is a template over `summary.json` in `app/src/content/summaryText.ts`, unit tested word for word. No language model, no API key, nothing server-side. The numbers change only when the pipeline runs, and a template can be checked by a reviewer in a way a generated sentence cannot.
- `pipeline/fetch_fallback_dem.py`: a 10 m USGS 3DEP grid for the study box, used by the tile step only where neither lidar survey has data.

**Problems hit**

- Terrain tiles cannot be transparent, and neither survey fills the study box, so the first 3D view had the ground falling to sea level outside the lidar, a 300-foot cliff around a parallelogram. The fallback grid fixes the edges; it is current USGS data and never touches a difference or a volume. Documented in DATA_SOURCES.md.
- Tiles were skipped where neither survey had data, so MapLibre got 404s at the edges. Every tile inside the advertised bounds is now written.

**Learned**

- MapLibre drapes any raster layer over terrain for free, so the classed change tiles from Phase 1 became the 3D skin with no new data.
- A terrain source cannot be swapped on a layer; the clean way to offer two surfaces is two sources and two hillshade layers with visibility toggled.

**Clip-worthy moment**

Tilt the map, switch between "2013 surface" and "March 24, 2014" and watch the hillside's upper third disappear and reappear as a fan across the valley. The change colors stay put, so the orange apron sits exactly where the ground now is.

**Assumed**

- Vertical exaggeration defaults to 1.3; the control shows the factor so nobody mistakes it for true scale.
- The USGS fallback is acceptable for edges outside both surveys. If not, those tiles could fall back to the 2013 surface alone where it exists and sea level elsewhere.

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
