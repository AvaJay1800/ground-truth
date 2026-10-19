import { lod, readout, units } from '../state';
import { describeChange, formatLength } from '../math/units';

export function Readout() {
  const r = readout.value;
  if (!r) return null;
  const u = units.value;
  const b = Number.isFinite(r.before_m) ? formatLength(r.before_m, u, 0) : null;
  const a = Number.isFinite(r.after_m) ? formatLength(r.after_m, u, 0) : null;
  return (
    <div class="card readout" role="status" aria-live="polite">
      <span class="mono">{r.lat.toFixed(5)}, {r.lon.toFixed(5)}</span>
      <span>2013 <b>{b ? `${b.value} ${b.unit}` : 'no data'}</b></span>
      <span>2014 <b>{a ? `${a.value} ${a.unit}` : 'no data'}</b></span>
      <span>change <b>{r.water ? 'lake surface, ' : ''}{describeChange(r.diff_m, lod.value, u)}</b></span>
    </div>
  );
}
