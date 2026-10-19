import { describe, expect, it } from 'vitest';
import { pointInRing, polygonVolume, ringArea, type Grid, type Ring } from '../src/math/volume';

function grid(width: number, height: number, fill: (c: number, r: number) => number, cell = 1): Grid {
  const data = new Float32Array(width * height);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) data[r * width + c] = fill(c, r);
  return { data, width, height, originX: 0, originY: height * cell, cell };
}

const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];

describe('geometry', () => {
  it('shoelace area of a 10 m square is 100', () => {
    expect(ringArea(square)).toBe(100);
  });
  it('point in ring', () => {
    expect(pointInRing(5, 5, square)).toBe(true);
    expect(pointInRing(15, 5, square)).toBe(false);
  });
});

describe('polygonVolume', () => {
  it('sums fill over cells inside the polygon only', () => {
    const g = grid(20, 20, () => 2); // uniform 2 m gain over 20 x 20 m
    const r = polygonVolume(g, square, 0.1);
    expect(r.cells_in_polygon).toBe(100);
    expect(r.fill_m3).toBeCloseTo(200);
    expect(r.cut_m3).toBe(0);
    expect(r.fill_uncertainty_m3).toBeCloseTo(100 * 0.1);
    expect(r.coverage).toBe(1);
  });
  it('separates cut from fill and ignores changes below the LoD', () => {
    const g = grid(10, 10, (c) => (c < 5 ? -1 : c < 8 ? 0.05 : 3));
    const r = polygonVolume(g, square, 0.1);
    expect(r.cut_m3).toBeCloseTo(50);     // 5 cols x 10 rows x 1 m
    expect(r.fill_m3).toBeCloseTo(60);    // 2 cols x 10 rows x 3 m
    expect(r.net_m3).toBeCloseTo(10);
    expect(r.cut_area_m2).toBe(50);
    expect(r.fill_area_m2).toBe(20);
  });
  it('reports water separately and leaves it out of earth totals', () => {
    const g = grid(10, 10, () => 2);
    const water = grid(10, 10, (_, r) => (r < 5 ? 1 : 0));
    const r = polygonVolume(g, square, 0.1, water);
    expect(r.cells_water).toBe(50);
    expect(r.water_rise_m3).toBeCloseTo(100);
    expect(r.fill_m3).toBeCloseTo(100);
  });
  it('counts no-data cells against coverage', () => {
    const g = grid(10, 10, (c) => (c < 5 ? NaN : 1));
    const r = polygonVolume(g, square, 0.1);
    expect(r.coverage).toBe(0.5);
    expect(r.fill_m3).toBeCloseTo(50);
  });
  it('respects cell size', () => {
    const g = grid(5, 5, () => 1, 2); // 2 m cells, 10 x 10 m extent
    const r = polygonVolume(g, square, 0.1);
    expect(r.cells_in_polygon).toBe(25);
    expect(r.fill_m3).toBeCloseTo(100);
  });
});
