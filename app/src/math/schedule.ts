// Calendar, weather and daylight turned into a week-by-week production schedule.
// Pure functions, unit tested. Dates are handled as UTC midnights to avoid DST surprises.

export interface MonthClimate {
  month: number;              // 1..12
  days_in_month: number;
  precip_mm: number;          // monthly total, mean over the record
  rain_days: number;          // days with >= rain_day_mm
  heavy_rain_days: number;    // days with >= heavy_rain_mm
  snow_days: number;
  freezing_days: number;      // days with max temperature <= 0 C
  tmax_c: number;
  tmin_c: number;
  daylight_h: number;         // mean hours of daylight
}

export interface WeatherRules {
  enabled: boolean;
  /** Days lost per heavy-rain day (1 = the whole day). */
  heavy_rain_loss: number;
  /** Days lost per ordinary rain day. */
  rain_loss: number;
  /** Days lost per freezing day. */
  freezing_loss: number;
  /** Days lost per snow day. */
  snow_loss: number;
}

export interface WorkWeek {
  shift_hours: number;        // productive-shift length, e.g. 10
  days_per_week: number;      // 5 or 6
  second_shift: boolean;      // doubles the daily hours
  daylight_only: boolean;     // cap hours at daylight minus one (no night work)
}

export interface ScheduleInputs {
  start: Date;                // first working day (UTC midnight)
  total_m3: number;           // bank volume to move
  /** Bank m³ moved per productive hour by the fleet (loader- or fleet-bound, already decided). */
  m3_per_hour: number;
  week: WorkWeek;
  weather: WeatherRules;
  climate: MonthClimate[];    // 12 entries
  /** Hard stop, so a bad input cannot loop forever. */
  max_weeks?: number;
}

export interface WeekRow {
  index: number;
  start: Date;
  m3: number;
  cumulative_m3: number;
  workdays: number;           // calendar workdays scheduled in the week
  lost_days: number;          // expected days lost to weather (fractional)
  hours_per_day: number;      // after the daylight cap
}

export interface ScheduleResult {
  weeks: WeekRow[];
  finish: Date | null;        // null if max_weeks was hit
  total_workdays: number;
  total_lost_days: number;
  calendar_days: number;
}

const DAY_MS = 86_400_000;

export function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Expected fraction of a scheduled day lost to weather in a given month. */
export function lostFraction(mc: MonthClimate, rules: WeatherRules): number {
  if (!rules.enabled) return 0;
  // Heavy-rain days are a subset of rain days; count the ordinary ones only once.
  const ordinaryRain = Math.max(0, mc.rain_days - mc.heavy_rain_days);
  const lost = mc.heavy_rain_days * rules.heavy_rain_loss
    + ordinaryRain * rules.rain_loss
    + mc.freezing_days * rules.freezing_loss
    + mc.snow_days * rules.snow_loss;
  return Math.min(1, lost / mc.days_in_month);
}

/** Productive hours in one day after the shift pattern and the daylight cap. */
export function hoursForDay(week: WorkWeek, daylight_h: number): number {
  let hours = week.shift_hours * (week.second_shift ? 2 : 1);
  if (week.daylight_only) hours = Math.min(hours, Math.max(0, daylight_h - 1));
  return hours;
}

/** Is this UTC date a scheduled workday? Monday..Friday, plus Saturday for a 6-day week. */
export function isWorkday(d: Date, week: WorkWeek): boolean {
  const dow = d.getUTCDay(); // 0 Sunday .. 6 Saturday
  if (dow === 0) return false;
  if (dow === 6) return week.days_per_week >= 6;
  return true;
}

export function simulate(inp: ScheduleInputs): ScheduleResult {
  const maxWeeks = inp.max_weeks ?? 520;
  const weeks: WeekRow[] = [];
  let remaining = inp.total_m3;
  let cumulative = 0;
  let totalWork = 0, totalLost = 0;
  let day = inp.start;
  let finish: Date | null = null;
  // Align the first row to the Monday on or before the start, so bars line up with weeks.
  const offset = (day.getUTCDay() + 6) % 7;
  let weekStart = addDays(day, -offset);

  for (let w = 0; w < maxWeeks && remaining > 0; w++) {
    const row: WeekRow = { index: w, start: weekStart, m3: 0, cumulative_m3: 0, workdays: 0, lost_days: 0, hours_per_day: 0 };
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      if (d < inp.start || remaining <= 0 || !isWorkday(d, inp.week)) continue;
      const mc = inp.climate[d.getUTCMonth()];
      const lost = lostFraction(mc, inp.weather);
      const hours = hoursForDay(inp.week, mc.daylight_h);
      const produced = Math.min(remaining, inp.m3_per_hour * hours * (1 - lost));
      row.workdays += 1;
      row.lost_days += lost;
      row.hours_per_day = hours;
      row.m3 += produced;
      remaining -= produced;
      if (remaining <= 1e-6) { remaining = 0; finish = d; }
    }
    cumulative += row.m3;
    row.cumulative_m3 = cumulative;
    totalWork += row.workdays;
    totalLost += row.lost_days;
    weeks.push(row);
    weekStart = addDays(weekStart, 7);
  }
  return {
    weeks, finish, total_workdays: totalWork, total_lost_days: totalLost,
    calendar_days: finish ? Math.round((finish.getTime() - inp.start.getTime()) / DAY_MS) + 1 : weeks.length * 7,
  };
}
