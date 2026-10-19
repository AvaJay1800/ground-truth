// Longitude/latitude (WGS84, which is NAD83 within the width of a pencil line here)
// to UTM zone 10N (EPSG:26910) and back. The pipeline put every raster in this
// projection, so the browser needs the same transform to find a cell under the
// cursor or inside a drawn polygon. Standard Transverse Mercator series (Snyder,
// "Map Projections: A Working Manual", 1987), accurate to a millimeter in-zone.
// Written out rather than pulling in proj4 for one projection.

const A = 6378137.0;                 // GRS80 semi-major axis
const F = 1 / 298.257222101;         // GRS80 flattening
const K0 = 0.9996;
const E2 = F * (2 - F);              // first eccentricity squared
const EP2 = E2 / (1 - E2);           // second eccentricity squared
const FALSE_EASTING = 500000;
const DEG = Math.PI / 180;

export const UTM_ZONE = 10;
export const CENTRAL_MERIDIAN_DEG = -123;

export interface XY { x: number; y: number; }

export function lonLatToUtm(lon: number, lat: number): XY {
  const phi = lat * DEG;
  const dlam = (lon - CENTRAL_MERIDIAN_DEG) * DEG;
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
  const n = A / Math.sqrt(1 - E2 * sin * sin);
  const t = tan * tan;
  const c = EP2 * cos * cos;
  const a = cos * dlam;
  const m = meridianArc(phi);
  const x = K0 * n * (a + (1 - t + c) * a ** 3 / 6
    + (5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5 / 120);
  const y = K0 * (m + n * tan * (a * a / 2 + (5 - t + 9 * c + 4 * c * c) * a ** 4 / 24
    + (61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6 / 720));
  return { x: x + FALSE_EASTING, y };
}

export function utmToLonLat(x: number, y: number): { lon: number; lat: number } {
  const xr = x - FALSE_EASTING;
  const m = y / K0;
  const mu = m / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sin = Math.sin(phi1), cos = Math.cos(phi1), tan = Math.tan(phi1);
  const n1 = A / Math.sqrt(1 - E2 * sin * sin);
  const t1 = tan * tan;
  const c1 = EP2 * cos * cos;
  const r1 = A * (1 - E2) / (1 - E2 * sin * sin) ** 1.5;
  const d = xr / (n1 * K0);
  const lat = phi1 - (n1 * tan / r1) * (d * d / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6 / 720);
  const lon = CENTRAL_MERIDIAN_DEG * DEG + (d - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5 / 120) / cos;
  return { lon: lon / DEG, lat: lat / DEG };
}

function meridianArc(phi: number): number {
  return A * ((1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256) * phi
    - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * E2 * E2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * E2 ** 3 / 3072) * Math.sin(6 * phi));
}
