import { runSchedule } from '../model/scheduleModel';
import { haulModel } from '../model/haulModel';
import { formatVolume } from '../math/units';
import { panel, timeline, units } from '../state';

/** Slider under the map: fraction of the trucked volume cleared, mapped to the schedule's calendar. */
export function Timeline() {
  if (panel.value !== 'schedule') return null;
  const r = runSchedule();
  const m = haulModel();
  if (!r || !m) return null;
  const f = timeline.value;
  const total = m.trucked_bank_m3;
  const target = f * total;
  const week = r.weeks.find((w) => w.cumulative_m3 >= target - 1e-6) ?? r.weeks[r.weeks.length - 1];
  const u = units.value;
  const moved = formatVolume(target, u);
  return (
    <div class="card timeline" role="group" aria-label="Timeline">
      <div class="tl-row">
        <span class="tl-label">March 24, 2014</span>
        <input type="range" min={0} max={100} step={1} value={Math.round(f * 100)} aria-label="Percent of the cleanup complete"
          onInput={(e) => (timeline.value = Number((e.target as HTMLInputElement).value) / 100)} />
        <span class="tl-label">Cleared</span>
      </div>
      <div class="tl-read">
        <b>{Math.round(f * 100)}% cleared</b> · {moved.value} {moved.unit} moved · {f === 0 ? 'the surveyed surface' : `week ${week.index + 1}, ${week.start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}`}
        <span class="muted"> · {f === 0 ? 'measured' : 'projection: surface interpolated inside the corridor'}</span>
      </div>
    </div>
  );
}
