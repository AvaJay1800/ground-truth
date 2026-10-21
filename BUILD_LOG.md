# Build log

Dated notes on what was built, what went wrong, what I learned, and one clip-worthy moment per phase.

## 2026-10-20 — Onboarding, after the first real test

David's first look found two things: he could not find how to draw, and the timeline did not seem to work. Drawing worked; it was three steps away with no cue on the map. The timeline worked; it hid the change colors while scrubbing and the flat deposit's hillshade barely moved, so the map looked broken. Both were feedback problems, and both are the kind a first-time user hits before anything else.

**Built**

- A map toolbar on the left edge: Draw, Clear, Help. Tools that act on the map live on the map.
- In-draw guidance: crosshair cursor, a pill that follows the pointer and says what the next click does ("Click to place the first corner", then "Click to add a corner, or click the first corner to finish", always "Esc cancels"), Escape to cancel, and the Measure results opening when the shape closes.
- A help toggle. Numbered coach marks on the swipe handle, the view switch, the draw tool, the tabs and the timeline. On by default for a first visit, remembered per device, and the "?" turns them off and on. Tooltips on every control.
- A first-visit card, "Three things to try", with "Show me with hints", "Jump to drawing" and "Just explore". Reopenable from About this data.
- Timeline feedback: `make_projection_tiles.py` now also cuts a change map per step, so the orange thins inside the corridor as the slider moves instead of disappearing; a play button runs the weeks over eight seconds; a "Projection" tag sits over the map with the week and date while scrubbing.

**Problems hit**

- My first attempt to reproduce the draw bug failed because the browser pane's emulated viewport scaled pointer events; in a native viewport it drew fine. Reproduce in the real thing before concluding.
- Windows' application control policy started blocking the native DLL in shapely mid-session. The projection script only used it to project one polygon, so it now does that with pyproj on plain GeoJSON. `haul_prep.py` still needs shapely for the corridor buffer; its output is already saved.

**Learned**

- When a projection hides the measured thing, the user reads it as a bug. Show the projected version of the same layer instead.
- Coach marks have to live in the component they describe, or they end up under a panel.

## 2026-10-19 — Phase 5: polish and publish

**Built**

- Field view on phones: opens on the change map with the summary at the top and the details sheet tucked to a handle; the legend sits over the map; 3D is a tap away but not the default. The sheet carries the four tabs.
- Accessibility: every control is a real button, input or select with a label; the swipe handle is a keyboard slider; tabs are a tab list; hover readouts are live regions; the water class is hatched and every legend class is labeled, so color is never the only cue; focus rings on everything; reduced-motion shortens the camera moves; forced-colors keeps the swatches. Drawing a polygon still needs a pointer, and the README says so.
- Performance: Terra Draw and geotiff.js now load on first use, which takes them and the raster decoders out of the first paint. The first load is MapLibre, Preact and the app, about 360 KB gzipped, plus the basemap and terrain tiles in view. No raster is ever loaded whole.
- PWA: a web manifest, generated icons, and a small hand-written service worker that caches the app shell and never touches data or range requests. No plugin added.
- README rewritten: what, why, how to run the pipeline and the app, deploy steps, assumptions and limitations, credits.
- Deploy tooling: `pipeline/upload_r2.py` (boto3 against R2's S3 API, incremental, sets CORS) and `app/scripts/publish.mjs` (production build with the R2 data URL, copied into the live site's repo with cache and service-worker headers).

**Problems hit**

- A mobile CSS rule I added landed before the one it was meant to replace, so the legend kept its old place. Cascade order, not specificity.
- The desktop app's preview launcher still points at the old portfolio project; Vite was run directly for verification throughout.

**Learned**

- Code splitting by intent works better than by size: nobody needs the TIFF decoders until they hover or draw, so that is when they arrive.
- A service worker for a demo should cache the shell and nothing else. Caching tiles or GeoTIFF ranges would make the numbers stale the first time the pipeline reruns.

**Clip-worthy moment**

On a phone, the first screen is the sentence, the change map and a legend. Everything a superintendent needs in the field, and the whole spreadsheet is one tap down.

**Assumed and pending**

- Hosting: an R2 bucket with public access and an API token are needed to upload the 160 MB of data; the live site repo deploys on push to main via Cloudflare Pages. Both steps wait on credentials and a final go-ahead.

## 2026-10-19 — Phase 4: timeline, scheduling and climate

**Built**

- `pipeline/climate_prep.py`: thirty years (1991 to 2020) of daily weather for the site from Open-Meteo's historical API (ERA5 reanalysis, free, no key), reduced to monthly means: precipitation, rain days, heavy-rain days, snow days, freezing days, high and low temperature, daylight hours. NOAA's 1991 to 2020 normals for Darrington Ranger Station, 18 km up the valley, stored beside them as a cross-check.
- `app/src/math/schedule.ts`: a day-by-day simulation with weekends, an optional Saturday, a second shift, a daylight cap, and expected weather losses per month, summed into week rows with a finish date. Eight vitest cases.
- `pipeline/make_projection_tiles.py`: five full terrain tile sets (20 to 100 percent cleared) where the corridor surface is interpolated between the March 24, 2014 ground and the 2013 grade. 2,095 tiles, 66 MB.
- Schedule tab: start month and year, shift length, days per week, second shift, daylight only, weather on or off, four editable loss rules, a single-series week chart with hover and a table view, a what-if table (more trucks, Saturdays, second shift, later start, no weather) with one-click apply, and a twelve-month climate strip with the scheduled months highlighted.
- Timeline slider under the map: percent cleared maps to the schedule's calendar and swaps the 2014 terrain source for the nearest projected step, so the hillshade and the 3D view both move. Labeled as a projection while scrubbing; the change colors hide so they cannot contradict the surface.
- Shared `haulModel` and `scheduleModel` so the cleanup panel, the schedule and the slider all compute from one set of inputs.

**Problems hit**

- My first NOAA station id was Davenport in eastern Washington. The NCEI search endpoint found the right one, Darrington RS (USC00451992).
- The reanalysis runs about 20 percent wetter than the Darrington gauge (100 in a year against 83). The strip says so and the lost-day counts are described as cautious. NOAA's rain-day counts came back empty in metric units, so the cross-check is on totals and temperatures.
- A dataviz skill run before the chart: single series, 24 px cap, rounded tips, hairline grid, text in ink tokens, hover tooltip plus a table view, no legend for one series.

**Learned**

- Weather is a fraction, not a switch. Spreading expected lost days across a month makes every November week slower rather than deleting random days, which is both easier to explain and closer to how estimators think.
- The what-ifs show the real levers. With the defaults, a second shift and four more trucks each save about five weeks; starting in July instead of April costs thirteen, because the job runs into the wet season.
- Swapping a raster-dem source's tile URLs is enough to animate terrain in MapLibre; no second map, no custom layers.

**Clip-worthy moment**

Drag the slider and the debris apron on SR 530 sinks back to the 2013 grade week by week, with the finish date on the panel: August 6, 2014, with eight trucks and ten-hour days, fifteen of those days lost to rain. Move the start to July and the date jumps to November, the chart's bars thinning as the rain returns.

**Assumed**

- Weather loss rules: a heavy-rain day (≥ 0.5 in) and a freezing or snow day lose the whole day; an ordinary rain day loses a quarter. Editable.
- Daylight only: productive hours capped at daylight minus one. A second shift under that cap gains nothing, which the math makes visible.
- The timeline interpolates the corridor surface uniformly. A real job clears from one end; the slider's percent cleared is the volume fraction, not a place.

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
