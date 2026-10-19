// Turns the schedule settings plus the haul model into a simulated schedule.
import { simulate, utcDate, type ScheduleInputs, type ScheduleResult, type WeatherRules, type WorkWeek } from '../math/schedule';
import { haulModel } from './haulModel';
import {
  climate, daylightOnly, daysPerWeek, efficiency, freezingLoss, heavyRainLoss, rainLoss, secondShift, shiftHours,
  snowLoss, startMonth, startYear, weatherOn,
} from '../state';

export interface ScheduleOverrides {
  week?: Partial<WorkWeek>;
  weather?: Partial<WeatherRules>;
  startMonth?: number;
  startYear?: number;
  /** Multiply the fleet's hourly rate (for "add trucks" what-ifs). */
  rateFactor?: number;
}

export function currentInputs(o: ScheduleOverrides = {}): ScheduleInputs | null {
  const c = climate.value;
  const m = haulModel();
  if (!c || !m) return null;
  const y = o.startYear ?? startYear.value;
  const mo = o.startMonth ?? startMonth.value;
  // Start on the first Monday of the chosen month.
  let start = utcDate(y, mo, 1);
  while (start.getUTCDay() !== 1) start = new Date(start.getTime() + 86_400_000);
  const week: WorkWeek = {
    shift_hours: shiftHours.value, days_per_week: daysPerWeek.value, second_shift: secondShift.value, daylight_only: daylightOnly.value,
    ...o.week,
  };
  const weather: WeatherRules = {
    enabled: weatherOn.value, heavy_rain_loss: heavyRainLoss.value, rain_loss: rainLoss.value,
    freezing_loss: freezingLoss.value, snow_loss: snowLoss.value, ...o.weather,
  };
  return {
    start,
    total_m3: m.trucked_bank_m3,
    // The haul model's rate already includes the loader cap; the shift efficiency applies per hour.
    m3_per_hour: m.bank_m3_per_hour * efficiency.value * (o.rateFactor ?? 1),
    week, weather, climate: c.months, max_weeks: 260,
  };
}

export function runSchedule(o: ScheduleOverrides = {}): ScheduleResult | null {
  const inp = currentInputs(o);
  return inp ? simulate(inp) : null;
}
