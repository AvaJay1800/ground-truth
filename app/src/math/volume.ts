// Cut and fill inside a drawn polygon, from a window of the difference grid.
// Mirrors pipeline/lod.py so the browser and the pipeline agree to the cell.

export interface Grid {
  /** Row-major values, NaN where there is no data. */
  data: Float32Array | Float64Array | number[];
  width: number;
  height: number;
  /** Projected coordinate of the top-left corner of the top-left cell. */
  originX: number;
  originY: number;
  /** Cell size in projected units (meters). Positive; rows go down (south). */
  cell: number;
}

export interface VolumeResult {
  cut_m3: number;
  fill_m3: number;
  net_m3: number;
  cut_area_m2: number;
  fill_area_m2: number;
  polygon_area_m2: number;
  cells_in_polygon: number;
  cells_with_data: number;
  cells_water: number;
  water_rise_m3: number;
  cut_uncertainty_m3: number;
  fill_uncertainty_m3: number;
  net_uncertainty_m3: number;
  lod_m: number;
  /** Fraction of the polygon's cells that had data, so the UI can warn about edges. */
  coverage: number;
}

export type Ring = Array<[number, number]>;

/** Even-odd point in polygon for one ring (projected coordinates). */
export function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shoelace area, in squared projected units. */
export function ringArea(ring: Ring): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(s) / 2;
}

/**
 * Sum change over the cells whose centers fall inside the ring.
 * `water`, if given, marks cells to leave out of earth totals (reported as water rise).
 */
export function polygonVolume(diff: Grid, ring: Ring, lod_m: number, water?: Grid): VolumeResult {
  const cellArea = diff.cell * diff.cell;
  let cut = 0, fill = 0, cutCells = 0, fillCells = 0, inPoly = 0, withData = 0, waterCells = 0, waterRise = 0;
  for (let r = 0; r < diff.height; r++) {
    const cy = diff.originY - (r + 0.5) * diff.cell;
    for (let c = 0; c < diff.width; c++) {
      const cx = diff.originX + (c + 0.5) * diff.cell;
      if (!pointInRing(cx, cy, ring)) continue;
      inPoly++;
      const dz = diff.data[r * diff.width + c];
      if (!Number.isFinite(dz)) continue;
      withData++;
      if (water && water.data[r * water.width + c] === 1) {
        waterCells++;
        if (dz > lod_m) waterRise += dz * cellArea;
        continue;
      }
      if (dz < -lod_m) { cut -= dz * cellArea; cutCells++; }
      else if (dz > lod_m) { fill += dz * cellArea; fillCells++; }
    }
  }
  const cutArea = cutCells * cellArea;
  const fillArea = fillCells * cellArea;
  return {
    cut_m3: cut,
    fill_m3: fill,
    net_m3: fill - cut,
    cut_area_m2: cutArea,
    fill_area_m2: fillArea,
    polygon_area_m2: ringArea(ring),
    cells_in_polygon: inPoly,
    cells_with_data: withData,
    cells_water: waterCells,
    water_rise_m3: waterRise,
    cut_uncertainty_m3: cutArea * lod_m,
    fill_uncertainty_m3: fillArea * lod_m,
    net_uncertainty_m3: (cutArea + fillArea) * lod_m,
    lod_m,
    coverage: inPoly ? withData / inPoly : 0,
  };
}
