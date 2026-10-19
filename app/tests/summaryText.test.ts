import { describe, expect, it } from 'vitest';
import { summaryText } from '../src/content/summaryText';
import type { Summary } from '../src/state';

// A summary.json shaped like the real one (values rounded from the 2026-10-19 run).
const s = {
  totals: { cut_m3: 5_001_118, fill_m3: 4_578_941 },
  totals_over_1m: { fill_area_m2: 1_280_000 },
  max_gain_m: 22.4,
  max_loss_m: -87.4,
  water: { area_m2: 1_328_453 },
  lod: { lod_m: 0.162 },
} as unknown as Summary;

describe('summaryText', () => {
  it('writes the headline in US units', () => {
    const t = summaryText(s, 'us');
    expect(t.headline).toBe(
      'About 6.5 million cubic yards of hillside came down, and about 6.0 million cubic yards came to rest across 316 acres of the valley. The debris is 73 ft deep at its thickest.',
    );
  });
  it('writes the headline in metric', () => {
    const t = summaryText(s, 'metric');
    expect(t.headline).toContain('5.0 million cubic meters of hillside');
    expect(t.headline).toContain('128 ha of the valley');
    expect(t.headline).toContain('22 m deep');
  });
  it('mentions the scarp depth and the lake', () => {
    const t = summaryText(s, 'us');
    expect(t.detail).toContain('up to 287 ft lower');
    expect(t.detail).toContain('lake of 328 acres');
  });
  it('states the level of detection in the caveat', () => {
    expect(summaryText(s, 'us').caveat).toContain('smaller than 0.5 ft');
    expect(summaryText(s, 'metric').caveat).toContain('smaller than 0.16 m');
  });
});
