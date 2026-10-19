import { describe, expect, it } from 'vitest';
import {
  describeChange, formatArea, formatLength, formatVolume, humanVolume,
  m2ToAcres, m3ToYd3, mToFt, yd3ToM3,
} from '../src/math/units';

describe('units', () => {
  it('converts meters to US survey feet', () => {
    expect(mToFt(1)).toBeCloseTo(3.2808333, 6);
    expect(mToFt(89.41)).toBeCloseTo(293.34, 2);
  });
  it('converts cubic meters to cubic yards and back', () => {
    expect(m3ToYd3(1)).toBeCloseTo(1.30795, 4);
    expect(yd3ToM3(m3ToYd3(4950000))).toBeCloseTo(4950000, 3);
  });
  it('converts square meters to acres', () => {
    expect(m2ToAcres(4046.8564224)).toBeCloseTo(1, 9);
    expect(m2ToAcres(1495000)).toBeCloseTo(369.4, 1);
  });
  it('formats volumes grouped by thousands', () => {
    expect(formatVolume(4950000, 'us')).toEqual({ value: '6,474,356', unit: 'yd³' });
    expect(formatVolume(4950000, 'metric')).toEqual({ value: '4,950,000', unit: 'm³' });
    expect(formatVolume(0, 'us').value).toBe('0');
  });
  it('formats lengths with sensible precision', () => {
    expect(formatLength(0.162, 'us')).toEqual({ value: '0.5', unit: 'ft' });
    expect(formatLength(0.162, 'metric')).toEqual({ value: '0.16', unit: 'm' });
    expect(formatLength(87.4, 'us')).toEqual({ value: '287', unit: 'ft' });
  });
  it('formats areas', () => {
    expect(formatArea(1495000, 'us')).toEqual({ value: '369', unit: 'acres' });
    expect(formatArea(1495000, 'metric')).toEqual({ value: '150', unit: 'ha' });
  });
  it('writes headline volumes in words', () => {
    expect(humanVolume(4950000, 'us')).toBe('6.5 million cubic yards');
    expect(humanVolume(4950000, 'metric')).toBe('5.0 million cubic meters');
    expect(humanVolume(12000, 'metric')).toBe('12 thousand cubic meters');
  });
  it('describes change in words with the level of detection', () => {
    expect(describeChange(0.05, 0.162, 'us')).toBe('no detectable change');
    expect(describeChange(-87.4, 0.162, 'us')).toBe('287 ft lower');
    expect(describeChange(2.81, 0.162, 'metric')).toBe('2.81 m higher');
    expect(describeChange(NaN, 0.162, 'us')).toBe('no data');
  });
});
