// Unit conversions. Everything in the data is meters; the UI shows US customary units
// by default because that is what a superintendent on a Washington job site reads.

export const US_SURVEY_FOOT_M = 0.30480060960121924; // the surveys' own unit
export const CUBIC_YARD_M3 = 0.764554857984;          // 3 international feet cubed
export const ACRE_M2 = 4046.8564224;
export const HECTARE_M2 = 10000;

export type UnitSystem = 'us' | 'metric';

export const mToFt = (m: number): number => m / US_SURVEY_FOOT_M;
export const ftToM = (ft: number): number => ft * US_SURVEY_FOOT_M;
export const m3ToYd3 = (m3: number): number => m3 / CUBIC_YARD_M3;
export const yd3ToM3 = (yd3: number): number => yd3 * CUBIC_YARD_M3;
export const m2ToAcres = (m2: number): number => m2 / ACRE_M2;
export const m2ToHectares = (m2: number): number => m2 / HECTARE_M2;

export interface Formatted { value: string; unit: string; }

/** Length for display: feet or meters, with sensible precision. */
export function formatLength(m: number, system: UnitSystem, digits?: number): Formatted {
  if (system === 'us') {
    const ft = mToFt(m);
    return { value: fixed(ft, digits ?? (Math.abs(ft) < 10 ? 1 : 0)), unit: 'ft' };
  }
  return { value: fixed(m, digits ?? (Math.abs(m) < 10 ? 2 : 1)), unit: 'm' };
}

/** Volume for display: cubic yards or cubic meters, grouped thousands. */
export function formatVolume(m3: number, system: UnitSystem): Formatted {
  const v = system === 'us' ? m3ToYd3(m3) : m3;
  return { value: grouped(v), unit: system === 'us' ? 'yd³' : 'm³' };
}

/** Area for display: acres or hectares. */
export function formatArea(m2: number, system: UnitSystem): Formatted {
  const v = system === 'us' ? m2ToAcres(m2) : m2ToHectares(m2);
  return { value: fixed(v, v < 10 ? 2 : v < 100 ? 1 : 0), unit: system === 'us' ? 'acres' : 'ha' };
}

/** Big volumes in words, for the headline: "4.9 million". */
export function humanVolume(m3: number, system: UnitSystem): string {
  const v = system === 'us' ? m3ToYd3(m3) : m3;
  const unit = system === 'us' ? 'cubic yards' : 'cubic meters';
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} million ${unit}`;
  if (v >= 1e3) return `${Math.round(v / 1e3)} thousand ${unit}`;
  return `${Math.round(v)} ${unit}`;
}

export function fixed(v: number, digits: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function grouped(v: number): string {
  const abs = Math.abs(v);
  const digits = abs < 10 ? 1 : 0;
  return Math.round(v * 10 ** digits) === 0 && abs > 0
    ? fixed(v, 2)
    : fixed(v, digits);
}

/** Signed change with a word, so a non-expert never has to decode a minus sign. */
export function describeChange(dz_m: number, lod_m: number, system: UnitSystem): string {
  if (!Number.isFinite(dz_m)) return 'no data';
  if (Math.abs(dz_m) <= lod_m) return 'no detectable change';
  const f = formatLength(Math.abs(dz_m), system);
  return `${f.value} ${f.unit} ${dz_m < 0 ? 'lower' : 'higher'}`;
}
