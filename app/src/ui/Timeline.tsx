import { useEffect } from 'preact/hooks';
import { runSchedule } from '../model/scheduleModel';
import { haulModel } from '../model/haulModel';
import { formatVolume } from '../math/units';
import { panel, playing, reducedMotion, timeline, units } from '../state';
import { Coach } from './Coach';

const PLAY_SECONDS = 8;

/** Slider under the map: fraction of the trucked volume cleared, mapped to the schedule's calendar. */
export function Timeline() {
  const active = panel.value === 'schedule';

  // Play: advance the slider from where it is to the end over a few seconds.
  useEffect(() => {
    if (!playing.value) return;
    let raf = 0;
    const startF = timeline.value >= 1 ? 0 : timeline.value;
    const t0 = performance.now();
    const secs = reducedMotion ? 0.01 : PLAY_SECONDS * (1 - startF);
    const tick = (t: number) => {
      const f = Math.min(1, startF + (t - t0) / 1000 / Math.max(0.01, secs) * (1 - startF));
      timeline.value = f;
      if (f < 1 && playing.value) raf = requestAnimationFrame(tick); else playing.value = false;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing.value]);

  if (!active) return null;
  const r = runSchedule();
  const m = haulModel();
  if (!r || !m) return null;
  const f = timeline.value;
  const total = m.trucked_bank_m3;
  const target = f * total;
  const week = r.weeks.find((w) => w.cumulative_m3 >= target - 1e-6) ?? r.weeks[r.weeks.length - 1];
  const u = units.value;
  const moved = formatVolume(target, u);
  const date = week.start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <>
      {f > 0 && (
        <div class="card projection-tag" role="status">
          <b>Projection</b> · week {week.index + 1} of {r.weeks.length} · {date} · surface interpolated inside the corridor
        </div>
      )}
      <div class="card timeline" role="group" aria-label="Timeline">
        <div class="tl-row">
          <button type="button" class="tool" onClick={() => (playing.value = !playing.value)} aria-label={playing.value ? 'Pause' : 'Play the weeks'} title={playing.value ? 'Pause' : 'Play the weeks'}>
            {playing.value
              ? <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg>
              : <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>}
          </button>
          <span class="tl-label">March 24, 2014</span>
          <input type="range" min={0} max={100} step={1} value={Math.round(f * 100)} aria-label="Percent of the cleanup complete"
            onInput={(e) => { playing.value = false; timeline.value = Number((e.target as HTMLInputElement).value) / 100; }} />
          <span class="tl-label">Cleared</span>
        </div>
        <div class="tl-read">
          <b>{Math.round(f * 100)}% cleared</b> · {moved.value} {moved.unit} moved · {f === 0 ? 'the surveyed surface, measured' : `week ${week.index + 1}, ${date}`}
        </div>
        <Coach n={5} side="above">Press play, or drag, to watch the corridor clear week by week</Coach>
      </div>
    </>
  );
}
