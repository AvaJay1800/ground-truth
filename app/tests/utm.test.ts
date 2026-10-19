import { describe, expect, it } from 'vitest';
import { lonLatToUtm, utmToLonLat } from '../src/math/utm';

// Reference values computed with pyproj 3.8 (EPSG:4326 -> EPSG:26910) during Phase 0.
describe('UTM zone 10N', () => {
  it('projects the center of the Oso slide', () => {
    const p = lonLatToUtm(-121.848, 48.283);
    expect(p.x).toBeCloseTo(585462, 0);
    expect(p.y).toBeCloseTo(5348397, 0);
  });
  it('round-trips within a millimeter', () => {
    for (const [lon, lat] of [[-121.90, 48.25], [-121.80, 48.31], [-121.848, 48.283]]) {
      const p = lonLatToUtm(lon, lat);
      const q = utmToLonLat(p.x, p.y);
      expect(q.lon).toBeCloseTo(lon, 8);
      expect(q.lat).toBeCloseTo(lat, 8);
    }
  });
  it('puts the central meridian at the false easting', () => {
    expect(lonLatToUtm(-123, 48).x).toBeCloseTo(500000, 6);
  });
});
