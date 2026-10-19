import { describe, expect, it } from 'vitest';
import { hoursForDay, isWorkday, lostFraction, simulate, utcDate, type MonthClimate, type WeatherRules, type WorkWeek } from '../src/math/schedule';

const dry: MonthClimate = { month: 7, days_in_month: 31, precip_mm: 20, rain_days: 2, heavy_rain_days: 0, snow_days: 0, freezing_days: 0, tmax_c: 25, tmin_c: 10, daylight_h: 15.5 };
const wet: MonthClimate = { month: 12, days_in_month: 31, precip_mm: 300, rain_days: 20, heavy_rain_days: 8, snow_days: 2, freezing_days: 3, tmax_c: 5, tmin_c: 0, daylight_h: 8.5 };
const climate = Array.from({ length: 12 }, (_, i) => ({ ...(i >= 4 && i <= 8 ? dry : wet), month: i + 1, days_in_month: 30 }));

const rules: WeatherRules = { enabled: true, heavy_rain_loss: 1, rain_loss: 0.25, freezing_loss: 1, snow_loss: 1 };
const week5: WorkWeek = { shift_hours: 10, days_per_week: 5, second_shift: false, daylight_only: false };

describe('weather rules', () => {
  it('turns climate counts into a lost fraction', () => {
    // 8 heavy + 12 ordinary rain x 0.25 + 3 freezing + 2 snow = 16 of 31 days
    expect(lostFraction(wet, rules)).toBeCloseTo(16 / 31);
    expect(lostFraction(dry, rules)).toBeCloseTo(0.5 / 31);
    expect(lostFraction(wet, { ...rules, enabled: false })).toBe(0);
  });
  it('never loses more than every day', () => {
    expect(lostFraction(wet, { ...rules, rain_loss: 5 })).toBe(1);
  });
});

describe('hours and workdays', () => {
  it('applies shifts and the daylight cap', () => {
    expect(hoursForDay(week5, 15.5)).toBe(10);
    expect(hoursForDay({ ...week5, second_shift: true }, 15.5)).toBe(20);
    expect(hoursForDay({ ...week5, daylight_only: true }, 8.5)).toBe(7.5);
    expect(hoursForDay({ ...week5, daylight_only: true, second_shift: true }, 8.5)).toBe(7.5);
  });
  it('knows weekends', () => {
    const sat = utcDate(2014, 4, 5), sun = utcDate(2014, 4, 6), mon = utcDate(2014, 4, 7);
    expect(isWorkday(sat, week5)).toBe(false);
    expect(isWorkday(sat, { ...week5, days_per_week: 6 })).toBe(true);
    expect(isWorkday(sun, { ...week5, days_per_week: 6 })).toBe(false);
    expect(isWorkday(mon, week5)).toBe(true);
  });
});

describe('simulate', () => {
  it('moves the volume at the stated rate when weather is off and finishes on the right day', () => {
    // 100 m3/h x 10 h = 1000 m3 a day; 10,000 m3 takes 10 workdays: Mon Apr 7 2014 .. Fri Apr 18.
    const r = simulate({ start: utcDate(2014, 4, 7), total_m3: 10_000, m3_per_hour: 100, week: week5, weather: { ...rules, enabled: false }, climate });
    expect(r.total_workdays).toBe(10);
    expect(r.finish?.toISOString().slice(0, 10)).toBe('2014-04-18');
    expect(r.weeks.length).toBe(2);
    expect(r.weeks[0].m3).toBeCloseTo(5000);
    expect(r.weeks[1].cumulative_m3).toBeCloseTo(10_000);
    expect(r.calendar_days).toBe(12);
  });
  it('takes longer in the wet season with weather on', () => {
    const summer = simulate({ start: utcDate(2014, 6, 2), total_m3: 20_000, m3_per_hour: 100, week: week5, weather: rules, climate });
    const winter = simulate({ start: utcDate(2014, 12, 1), total_m3: 20_000, m3_per_hour: 100, week: week5, weather: rules, climate });
    expect(winter.weeks.length).toBeGreaterThan(summer.weeks.length);
    expect(winter.total_lost_days).toBeGreaterThan(summer.total_lost_days);
  });
  it('a six-day week and a second shift both finish sooner', () => {
    const base = simulate({ start: utcDate(2014, 6, 2), total_m3: 50_000, m3_per_hour: 100, week: week5, weather: rules, climate });
    const sat = simulate({ start: utcDate(2014, 6, 2), total_m3: 50_000, m3_per_hour: 100, week: { ...week5, days_per_week: 6 }, weather: rules, climate });
    const two = simulate({ start: utcDate(2014, 6, 2), total_m3: 50_000, m3_per_hour: 100, week: { ...week5, second_shift: true }, weather: rules, climate });
    expect(sat.finish!.getTime()).toBeLessThan(base.finish!.getTime());
    expect(two.finish!.getTime()).toBeLessThan(sat.finish!.getTime());
  });
  it('stops at max_weeks instead of looping', () => {
    const r = simulate({ start: utcDate(2014, 6, 2), total_m3: 1e12, m3_per_hour: 1, week: week5, weather: rules, climate, max_weeks: 5 });
    expect(r.finish).toBeNull();
    expect(r.weeks.length).toBe(5);
  });
});
