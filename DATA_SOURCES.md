# Data sources

Every elevation number in Ground Truth traces back to one of the datasets below. Nothing here is simulated. Where a fact was read from a dataset's own technical report or from the files themselves, the line says so.

Verified 2026-10-19.

## The pair we difference

| | Before | After |
|---|---|---|
| Portal project | Tulalip 2013 | Snohoco Oso A 2014 |
| Flown | April 17 to July 31, 2013 (report, Table 1) | March 24, 2014, two days after the slide (report, Table 1; LAZ header created 2014-03-28, GPS week-seconds fall on a Monday afternoon Pacific time) |
| Collected by | Watershed Sciences, Inc. (WSI) for the Puget Sound LiDAR Consortium | Quantum Spatial, Inc. (QSI) for the Washington State Department of Transportation |
| Product used | Bare-earth DTM, 3 ft grid | Bare-earth DTM, 3 ft grid |
| Native projection (report) | Washington State Plane North, NAD83 (CORS96), US survey feet | Washington State Plane North, NAD83 (2011), US survey feet |
| Vertical datum (report) | NAVD88, GEOID03 | NAVD88, GEOID12A |
| As served by the portal | NAD83(HARN) / Washington South (ftUS), 3 ft cells, float32, LZW, nodata -3.4e38 | same |
| Vertical accuracy (report) | RMSE 0.028 m, 1.96 sigma = 0.054 m, 2,950 RTK check points, open flat ground | RMSE 0.028 m, FVA (1.96 x RMSE) = 0.054 m, 1,113 check points, whole project |
| Point density target | 8 pulses per square meter | 8 pulses per square meter |
| Portal dataset ids | DTM 43, metadata 241, point cloud 292 | DTM 32, point cloud 281 (no metadata file on the portal) |

Level of detection used by the app: sqrt(0.054^2 + 0.054^2) = 0.076 m (0.25 ft) at 95 percent confidence, before any adjustment for the datum differences listed under Limitations.

## Other epochs on the portal, kept for later

| Portal project | Flown | What it is | Ids |
|---|---|---|---|
| Snohoco Oso B 2014 | April 2 to 9, 2014 (report) | A clip of the larger Oso Landslide / Stillaguamish River final acquisition. Same QSI report as Stillaguamish 2014. | DTM 595, metadata 599 |
| Snohoco Oso C 2014 | June 2014 (LAZ header created 2014-06-30; flown on a Saturday afternoon, consistent with the June 21, 2014 re-flight NV5 describes). No report on the portal. | Surface after three months of search and debris removal. | DTM 33, point cloud 282 |
| Stillaguamish 2014 | April 2 to 9, 2014 | Whole-river final acquisition for WSDOT, 36,932 acres. | DTM 38, metadata 236 |
| USGS 3DEP WA Western North 2016 | March 17, 2016 to June 6, 2017 | 1 m bare-earth DEM, UTM 10N meters, NAVD88 GEOID03. NVA 0.081 m at 95 percent. Shows the valley after cleanup and the rebuilt SR 530. | The National Map, tile x58y535 |

## Where the files come from

- Washington Lidar Portal, Washington State Department of Natural Resources: https://lidarportal.dnr.wa.gov. The portal's own page script calls three endpoints (`/project`, `/query`, `/download`); `pipeline/fetch_data.py` uses the same ones with a study-area polygon so only the tiles around the slide are pulled.
- 2013 Tulalip technical report (WSI, November 13, 2013): delivered by the portal as `ger_tulalip_2013_lidar_report.pdf` (dataset 241).
- 2014 Oso Landslide / Stillaguamish River technical report (QSI, May 28, 2014): delivered by the portal as `ger_snohoco_oso_b_2014_lidar_report.pdf` (dataset 599), also at https://pugetsoundlidar.ess.washington.edu/lidardata/proj_reports/Oso_Landslide_Stillaguamish_River_LiDAR_Report.pdf.
- The same 2013 survey is also on NOAA Digital Coast as "2013 PSLC Lidar: Tulalip" (ID 2614), already in UTM 10N meters with GEOID18, point cloud only: https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/laz/geoid18/2614/index.html. Not used, because the portal's DTM saves building one.
- USGS 1 m DEM and its project metadata: https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/WA_Western_North_2016/ and the `metadata/WA_Western_WA_QL1_LiDAR__2016__B16/` folder beside it.

## Limitations to carry into the app's "About this data" panel

1. **Two geoid models.** Both surveys are on NAVD88, but 2013 used GEOID03 and 2014 used GEOID12A. The models differ by a few centimeters in this part of Washington. The pipeline estimates any remaining systematic offset from stable ground (roads and fields well away from the slide) and reports it next to the level of detection, rather than pretending the two surfaces share a perfect zero.
2. **Resampled by the portal.** Both reports say the deliverables were 3 ft grids in State Plane North. The portal serves them in State Plane South, still at 3 ft. That is at least one resampling before our own. It smooths sharp edges slightly; it does not shift volumes in a measurable way at the scale of this slide, but it is why we do not quote changes below the level of detection.
3. **Bare earth, not surface.** Trees, houses and vehicles are removed by the vendors' ground classification. Under thick forest the ground is less certain than on open ground, so the quoted accuracy (measured on open flat ground) is a best case on the forested slope.
4. **March 24 accuracy was not assessed separately.** The 5.4 cm figure is for the combined March and April project. The March 24 flight was an emergency acquisition flown at 900 m; the report gives no separate check-point statistics for it.
5. **Water.** The debris dammed the North Fork Stillaguamish and formed a lake. Lidar does not return from water, so the difference over the pond is the pond surface, not the debris under it.
