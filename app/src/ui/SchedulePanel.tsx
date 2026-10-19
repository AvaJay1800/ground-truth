import { useState } from 'preact/hooks';
import { haulModel } from '../model/haulModel';
import { runSchedule, type ScheduleOverrides } from '../model/scheduleModel';
import type { ScheduleResult, WeekRow } from '../math/schedule';
import { formatVolume, type UnitSystem } from '../math/units';
import {
  climate, daylightOnly, daysPerWeek, freezingLoss, heavyRainLoss, nTrucks, rainLoss, secondShift, shiftHours,
  snowLoss, startMonth, startYear, timeline, units, weatherOn,
} from '../state';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const num = (e: Event) => Number((e.target as HTMLInputElement).value);
const fmtDate = (d: Date | null) => d ? d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : 'not within 5 years';

export function SchedulePanel() {
  const c = climate.value;
  const m = haulModel();
  const u = units.value;
  const r = runSchedule();
  if (!c || !m || !r) return <p class="hint">The schedule needs climate.json and haul.json from the pipeline.</p>;

  const weeks = r.weeks.length;
  const whatIfs: Array<{ label: string; o: ScheduleOverrides; apply: () => void }> = [
    { label: `${nTrucks.value + 4} trucks instead of ${nTrucks.value}`, o: { rateFactor: rateFactorForTrucks(m, nTrucks.value + 4) }, apply: () => (nTrucks.value += 4) },
    { label: daysPerWeek.value >= 6 ? 'Drop Saturdays' : 'Add Saturdays', o: { week: { days_per_week: daysPerWeek.value >= 6 ? 5 : 6 } }, apply: () => (daysPerWeek.value = daysPerWeek.value >= 6 ? 5 : 6) },
    { label: secondShift.value ? 'Single shift' : 'Second shift', o: { week: { second_shift: !secondShift.value } }, apply: () => (secondShift.value = !secondShift.value) },
    { label: `Start in ${MONTHS[(startMonth.value + 2) % 12]}`, o: { startMonth: ((startMonth.value + 2) % 12) + 1, startYear: startMonth.value + 3 > 12 ? startYear.value + 1 : startYear.value }, apply: () => { const nm = ((startMonth.value + 2) % 12) + 1; if (nm < startMonth.value) startYear.value += 1; startMonth.value = nm; } },
    { label: weatherOn.value ? 'No weather delays' : 'Weather delays on', o: { weather: { enabled: !weatherOn.value } }, apply: () => (weatherOn.value = !weatherOn.value) },
  ];

  return (
    <div>
      <p class="banner">A projection. The same what-if cleanup, put on a calendar with weekends, daylight and thirty years of weather. Every rule is editable.</p>

      <h2>When and how long</h2>
      <div class="fields">
        <label class="field">Start month
          <select value={startMonth.value} onChange={(e) => (startMonth.value = Number((e.target as HTMLSelectElement).value))}>
            {MONTHS.map((n, i) => <option value={i + 1} key={n}>{n}</option>)}
          </select>
        </label>
        <label class="field">Start year<input type="number" step="1" min="2014" max="2030" value={startYear.value} onChange={(e) => (startYear.value = Math.round(num(e)))} /></label>
        <label class="field">Shift length (h)<input type="number" step="0.5" min="4" max="12" value={shiftHours.value} onChange={(e) => (shiftHours.value = num(e))} /></label>
        <label class="field">Days per week
          <select value={daysPerWeek.value} onChange={(e) => (daysPerWeek.value = Number((e.target as HTMLSelectElement).value))}>
            <option value={5}>5 (Mon to Fri)</option>
            <option value={6}>6 (add Saturday)</option>
          </select>
        </label>
      </div>
      <div class="row" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '4px 0 10px' }}>
        <label class="check"><input type="checkbox" checked={secondShift.value} onChange={(e) => (secondShift.value = (e.target as HTMLInputElement).checked)} /> Second shift</label>
        <label class="check"><input type="checkbox" checked={daylightOnly.value} onChange={(e) => (daylightOnly.value = (e.target as HTMLInputElement).checked)} /> Daylight only (no lights)</label>
        <label class="check"><input type="checkbox" checked={weatherOn.value} onChange={(e) => (weatherOn.value = (e.target as HTMLInputElement).checked)} /> Weather delays</label>
      </div>

      <div class="stat-grid">
        <div class="stat wide">
          <div class="k">Projected finish</div>
          <div class="v">{fmtDate(r.finish)}</div>
          <div class="u">{weeks} weeks, {r.total_workdays} scheduled workdays, about {Math.round(r.total_lost_days)} lost to weather</div>
        </div>
        <div class="stat"><div class="k">Production</div><div class="v">{formatVolume(m.bank_m3_per_hour * 10, u).value}<small>{formatVolume(1, u).unit}</small></div><div class="u">bank per 10 productive hours</div></div>
        <div class="stat"><div class="k">To move by truck</div><div class="v">{formatVolume(m.trucked_bank_m3, u).value}<small>{formatVolume(1, u).unit}</small></div><div class="u">bank; reuse on site is not trucked</div></div>
      </div>

      <WeekChart r={r} u={u} />

      <h2>What if</h2>
      <table class="whatif">
        <thead><tr><th>Change</th><th>Finish</th><th>Difference</th><th></th></tr></thead>
        <tbody>
          {whatIfs.map((w) => {
            const alt = runSchedule(w.o);
            const diff = alt?.finish && r.finish ? Math.round((alt.finish.getTime() - r.finish.getTime()) / 86_400_000 / 7) : null;
            return (
              <tr key={w.label}>
                <td>{w.label}</td>
                <td>{fmtDate(alt?.finish ?? null)}</td>
                <td>{diff === null ? '' : diff === 0 ? 'same week' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} wk`}</td>
                <td><button type="button" class="btn small" onClick={w.apply}>Apply</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Weather rules</h2>
      <p class="hint">Expected days lost per month, from thirty-year averages. Lost days are spread across the month, so a week in November loses a fraction of every day rather than whole days.</p>
      <div class="fields">
        <label class="field">Per heavy-rain day (≥ 0.5 in)<input type="number" step="0.25" min="0" max="1" value={heavyRainLoss.value} onChange={(e) => (heavyRainLoss.value = num(e))} /></label>
        <label class="field">Per rain day (≥ 0.1 in)<input type="number" step="0.05" min="0" max="1" value={rainLoss.value} onChange={(e) => (rainLoss.value = num(e))} /></label>
        <label class="field">Per freezing day (high ≤ 32 °F)<input type="number" step="0.25" min="0" max="1" value={freezingLoss.value} onChange={(e) => (freezingLoss.value = num(e))} /></label>
        <label class="field">Per snow day (≥ 0.4 in)<input type="number" step="0.25" min="0" max="1" value={snowLoss.value} onChange={(e) => (snowLoss.value = num(e))} /></label>
      </div>

      <ClimateStrip r={r} />

      <h2>Timeline on the map</h2>
      <p class="hint">Drag the slider under the map to scrub week by week. The surface inside the corridor is interpolated between the March 24, 2014 ground and the cleared grade; it is a projection, not a survey.</p>
      <button type="button" class="btn" onClick={() => (timeline.value = 0)} disabled={timeline.value === 0}>Reset to March 24, 2014</button>
    </div>
  );
}

function rateFactorForTrucks(m: ReturnType<typeof haulModel>, n: number): number {
  if (!m) return 1;
  // Loader-bound fleets gain nothing from more trucks; fleet-bound ones scale until the loader caps them.
  const perTruck = m.bank_m3_per_hour / nTrucks.value;
  const loaderCap = m.plan.loader_bound ? m.bank_m3_per_hour : Infinity;
  return Math.min(perTruck * n, Math.max(loaderCap, m.bank_m3_per_hour * (m.saturate / nTrucks.value))) / m.bank_m3_per_hour;
}

// Single-series column chart of bank volume moved per week, hover tooltip, table view.
function WeekChart({ r, u }: { r: ScheduleResult; u: UnitSystem }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 328, H = 150, padL = 34, padB = 22, padT = 10;
  const n = r.weeks.length;
  const max = Math.max(1, ...r.weeks.map((w) => w.m3));
  const slot = (W - padL) / Math.max(1, n);
  const bw = Math.min(24, Math.max(2, slot - 2));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const unit = formatVolume(1, u).unit;
  const compact = (m3: number) => { const v = u === 'us' ? m3 / 0.764554857984 : m3; return v >= 1000 ? `${Math.round(v / 1000)}K` : `${Math.round(v)}`; };
  const ticks = [0, max / 2, max];
  const hovered = hover !== null ? r.weeks[hover] : null;
  const labelEvery = n > 26 ? 8 : n > 12 ? 4 : 2;
  return (
    <figure class="chart">
      <figcaption>Volume moved per week ({unit}, bank)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${n} weekly bars of volume moved`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} class="grid" />
            <text x={padL - 4} y={y(t) + 4} class="tick" text-anchor="end">{compact(t)}</text>
          </g>
        ))}
        {r.weeks.map((w, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          const top = y(w.m3), h = Math.max(0, y(0) - top);
          const rr = Math.min(4, h / 2, bw / 2);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              <path d={`M${x},${y(0)} v${-(h - rr)} a${rr},${rr} 0 0 1 ${rr},${-rr} h${bw - 2 * rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${h - rr} z`} class={`bar ${hover === i ? 'hot' : ''}`} />
              {i % labelEvery === 0 && <text x={padL + i * slot + slot / 2} y={H - 6} class="tick" text-anchor="middle">{w.start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}</text>}
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={y(0)} y2={y(0)} class="axis" />
      </svg>
      {hovered && (
        <div class="tip" role="status">
          Week of {hovered.start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}: <b>{formatVolume(hovered.m3, u).value} {unit}</b>,
          {' '}{hovered.workdays} workdays, {hovered.lost_days.toFixed(1)} lost to weather, {hovered.hours_per_day} h/day
        </div>
      )}
      <details>
        <summary>Table of weeks</summary>
        <table class="data">
          <thead><tr><th>Week of</th><th>Moved</th><th>Cumulative</th><th>Workdays</th><th>Lost</th></tr></thead>
          <tbody>{r.weeks.map((w: WeekRow) => (
            <tr key={w.index}><td>{w.start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}</td><td>{formatVolume(w.m3, u).value}</td><td>{formatVolume(w.cumulative_m3, u).value}</td><td>{w.workdays}</td><td>{w.lost_days.toFixed(1)}</td></tr>
          ))}</tbody>
        </table>
      </details>
    </figure>
  );
}

// Twelve months: precipitation columns, counts underneath, the scheduled months highlighted.
function ClimateStrip({ r }: { r: ScheduleResult }) {
  const c = climate.value!;
  const u = units.value;
  const maxP = Math.max(...c.months.map((m) => m.precip_mm));
  const active = new Set<number>();
  for (const w of r.weeks) active.add(w.start.getUTCMonth());
  const precip = (mm: number) => u === 'us' ? `${(mm / 25.4).toFixed(1)} in` : `${Math.round(mm)} mm`;
  const temp = (cDeg: number) => u === 'us' ? `${Math.round(cDeg * 9 / 5 + 32)}°` : `${Math.round(cDeg)}°`;
  const noaa = c.noaa_normals;
  return (
    <figure class="chart">
      <figcaption>A year at Oso: rain, cold and daylight (1991 to 2020 averages)</figcaption>
      <div class="strip" role="table" aria-label="Monthly climate">
        {c.months.map((m, i) => (
          <div class={`cell ${active.has(i) ? 'active' : ''}`} key={m.month} role="row" title={`${m.name}: ${precip(m.precip_mm)} of precipitation, ${m.rain_days} rain days, ${m.heavy_rain_days} heavy, ${m.freezing_days} freezing, ${m.daylight_h} h daylight`}>
            <div class="col"><div class="fillbar" style={{ height: `${(m.precip_mm / maxP) * 100}%` }} /></div>
            <div class="mo">{m.name}</div>
            <div class="n">{m.heavy_rain_days.toFixed(0)}<span>heavy</span></div>
            <div class="n">{m.freezing_days.toFixed(0)}<span>frz</span></div>
            <div class="n">{temp(m.tmax_c)}<span>high</span></div>
            <div class="n">{m.daylight_h.toFixed(0)}<span>h day</span></div>
          </div>
        ))}
      </div>
      <p class="hint">
        Columns are monthly precipitation. Highlighted months are in the schedule. Source: {c.source.name}, grid point {c.source.grid_point.lat.toFixed(2)}, {c.source.grid_point.lon.toFixed(2)} at {Math.round(c.source.grid_point.elevation_m)} m; {c.source.note}.
        {noaa && noaa[0] ? ` Cross-check: NOAA 1991 to 2020 normals at ${noaa[0].name} give ${precip(noaa.reduce((s, x) => s + (x.precip_mm ?? 0), 0))} a year against ${precip(c.months.reduce((s, x) => s + x.precip_mm, 0))} here; the reanalysis runs wetter than the valley gauge, so the lost-day counts lean cautious.` : ''}
      </p>
    </figure>
  );
}
