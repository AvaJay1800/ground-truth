import { SITE } from '../config';
import { summary, units } from '../state';
import { formatLength } from '../math/units';

export function AboutPanel() {
  const s = summary.value;
  const u = units.value;
  const L = (m: number, d?: number) => { const f = formatLength(m, u, d); return `${f.value} ${f.unit}`; };
  return (
    <div>
      <h2>What you are looking at</h2>
      <p>
        Two airplane-mounted laser surveys (lidar) of the same valley. Each one measured the height of the ground
        every few feet. Subtracting the older survey from the newer one shows where ground was lost and where
        material piled up, and by how much.
      </p>
      <p>
        Trees and buildings were removed by the survey vendors before this comparison, so a forest that was
        swept away shows up only as the change in the ground beneath it, not as the height of the trees.
      </p>

      <h2>The two surveys</h2>
      <ul>
        <li><b>Before:</b> Tulalip 2013, flown April to July 2013 by Watershed Sciences for the Puget Sound LiDAR Consortium.</li>
        <li><b>After:</b> Oso A 2014, flown March 24, 2014, two days after the slide, by Quantum Spatial for the Washington State Department of Transportation.</li>
        <li>Both: bare-earth grids at 3 ft, elevations in US survey feet on the NAVD88 vertical datum, published by the Washington Lidar Portal.</li>
      </ul>

      <h2>How sure are the numbers</h2>
      {s ? (
        <>
          <p>
            Each survey states its own vertical accuracy: within {L(s.before.sigma95_m, 2)} for 2013 and {L(s.after.sigma95_m, 2)} for 2014,
            95 percent of the time, on open flat ground. Combined, that is {L(s.lod.stated_m, 2)}.
          </p>
          <p>
            We also checked the two surfaces against each other on {Math.round(s.stable_ground.cells / 1e4).toLocaleString()} hectares of flat ground
            well away from the slide. They disagreed by {L(Math.abs(s.vertical_bias_removed_m), 2)} on average, which was removed,
            with a typical scatter of {L(s.stable_ground.nmad_m, 2)}. That scatter is larger than the stated accuracy, mostly because of
            forest, so the map uses the larger figure: changes smaller than <b>{L(s.lod.lod_m, 2)}</b> are shown as no detectable change.
          </p>
        </>
      ) : <p>Loading…</p>}

      <details>
        <summary>Datums, projections and units</summary>
        <ul>
          <li>Horizontal: both surveys were delivered in Washington State Plane North (NAD83). The portal serves them in State Plane South. The pipeline put both on one grid in UTM zone 10N (EPSG:26910) with 1 m cells.</li>
          <li>Vertical: NAVD88 in both, but through different geoid models (GEOID03 in 2013, GEOID12A in 2014). That is one reason the surfaces were checked against each other.</li>
          <li>Units: elevations converted from US survey feet (0.3048006 m) to meters once, in the pipeline. The display converts back on the fly.</li>
          <li>Difference = 2014 minus 2013. Negative means lower (cut), positive means higher (fill).</li>
        </ul>
      </details>
      <details>
        <summary>What the map cannot tell you</summary>
        <ul>
          <li>The debris dammed the North Fork Stillaguamish River and a lake formed upstream{s?.water.pool_elev_m ? `, at ${L(s.water.pool_elev_m, 0)} elevation` : ''}. Lidar reads the lake surface, not the ground under it. That area is hatched and left out of the earth totals.</li>
          <li>Accuracy was tested on open flat ground. Under dense forest and on steep slopes the ground is harder to see, so small changes there are less certain than the stated figures suggest.</li>
          <li>The March 24 flight was an emergency acquisition. Its accuracy was reported together with a larger April survey, not on its own.</li>
          <li>The 2013 survey was flown in summer; the 2014 one in late winter. Seasonal ground changes (river bars, snow, soft ground) contribute a little to the noise.</li>
          <li>Both grids were resampled at least twice (by the portal, then here). Sharp edges are slightly softened; volumes are not materially affected.</li>
        </ul>
      </details>
      <details>
        <summary>Sources</summary>
        <ul>
          <li>Washington Lidar Portal, Washington State Department of Natural Resources (lidarportal.dnr.wa.gov).</li>
          <li>Tulalip LiDAR Technical Data Report, WSI, November 13, 2013.</li>
          <li>Oso Landslide / Stillaguamish River LiDAR Technical Data Report, Quantum Spatial, May 28, 2014.</li>
          <li>Basemap: OpenFreeMap (OpenStreetMap data). Aerial photo: USGS The National Map, current imagery, which shows the valley after the cleanup.</li>
        </ul>
      </details>

      <p class="memorial">
        On the morning of {SITE.eventDate}, the hillside above the Steelhead Haven neighborhood collapsed. Forty-three people died.
        This page is about understanding the ground; for the event and the community, start with the{' '}
        <a href={SITE.memorialSource.url} target="_blank" rel="noopener">{SITE.memorialSource.label}</a>.
      </p>
    </div>
  );
}
