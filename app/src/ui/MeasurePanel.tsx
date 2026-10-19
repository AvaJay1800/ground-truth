import { drawing, mode, summary, units, volume, volumeBusy } from '../state';
import { formatArea, formatLength, formatVolume, humanVolume } from '../math/units';
import type { VolumeResult } from '../math/volume';

interface Props { onDraw(): void; onClear(): void; }

export function MeasurePanel({ onDraw, onClear }: Props) {
  const s = summary.value;
  const v = volume.value;
  const u = units.value;
  return (
    <div>
      <h2>Measure an area</h2>
      <p class="hint">
        Draw a shape on the map to get cut, fill and net volume inside it. Click to add corners, click the first
        corner again to finish. {mode.value !== 'change' ? 'Drawing switches the map to "What changed".' : ''}
      </p>
      <div class="row" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" class="btn primary" onClick={onDraw} aria-pressed={drawing.value}>
          {drawing.value ? 'Drawing…' : 'Draw area'}
        </button>
        <button type="button" class="btn" onClick={onClear} disabled={!v && !drawing.value}>Clear</button>
      </div>

      {volumeBusy.value && <p class="hint">Reading the difference grid…</p>}
      {v && !volumeBusy.value && <Result v={v} />}

      {s && (
        <>
          <h2>Whole study area</h2>
          <p>
            Across the surveyed ground, about <b>{humanVolume(s.totals.cut_m3, u)}</b> of earth left the hillside and
            about <b>{humanVolume(s.totals.fill_m3, u)}</b> came to rest below it. The deepest loss on the scarp is{' '}
            {fl(-s.max_loss_m, u)}; the thickest deposit is {fl(s.max_gain_m, u)}.
          </p>
          <div class="stat-grid">
            <Stat k="Cut" kind="cut" m3={s.totals.cut_m3} pm={s.totals.cut_uncertainty_m3} />
            <Stat k="Fill" kind="fill" m3={s.totals.fill_m3} pm={s.totals.fill_uncertainty_m3} />
            <div class="stat wide">
              <div class="k">Lake that formed behind the debris</div>
              <div class="v">{formatArea(s.water.area_m2, u).value}<small>{formatArea(s.water.area_m2, u).unit}</small></div>
              <div class="u">surface rose an average {fl(s.water.mean_depth_m, u)}; counted as water, not earth</div>
            </div>
          </div>
          <p class="hint">
            Cut and fill will not match exactly. Soil loosens when it moves, part of the deposit is under the lake
            where lidar cannot see it, and the river carried some away before the survey.
          </p>
        </>
      )}
    </div>
  );
}

function fl(m: number, u: 'us' | 'metric') {
  const f = formatLength(m, u, 0);
  return `${f.value} ${f.unit}`;
}

function Stat({ k, kind, m3, pm }: { k: string; kind: 'cut' | 'fill' | 'net'; m3: number; pm: number }) {
  const u = units.value;
  const f = formatVolume(m3, u);
  const p = formatVolume(pm, u);
  return (
    <div class="stat">
      <div class="k">{kind !== 'net' && <span class={`swatch ${kind}`} aria-hidden="true" />}{k}</div>
      <div class="v">{f.value}<small>{f.unit}</small></div>
      <div class="u">± {p.value} {p.unit}</div>
    </div>
  );
}

function Result({ v }: { v: VolumeResult }) {
  const u = units.value;
  const area = formatArea(v.polygon_area_m2, u);
  const net = formatVolume(v.net_m3, u);
  const netPm = formatVolume(v.net_uncertainty_m3, u);
  return (
    <div>
      <div class="stat-grid">
        <Stat k="Cut (ground removed)" kind="cut" m3={v.cut_m3} pm={v.cut_uncertainty_m3} />
        <Stat k="Fill (material added)" kind="fill" m3={v.fill_m3} pm={v.fill_uncertainty_m3} />
        <div class="stat wide">
          <div class="k">Net</div>
          <div class="v">{v.net_m3 >= 0 ? '+' : '−'}{net.value.replace('-', '')}<small>{net.unit}</small></div>
          <div class="u">± {netPm.value} {netPm.unit} · {v.net_m3 >= 0 ? 'more came in than left' : 'more left than came in'}</div>
        </div>
        <div class="stat wide">
          <div class="k">Area drawn</div>
          <div class="v">{area.value}<small>{area.unit}</small></div>
          <div class="u">
            {v.cells_water > 0 ? `includes ${formatArea(v.cells_water * v.cells_in_polygon > 0 ? (v.polygon_area_m2 * v.cells_water / v.cells_in_polygon) : 0, u).value} ${area.unit} of lake surface, left out of the earth totals` : 'no lake surface inside'}
            {v.coverage < 0.98 ? ` · ${Math.round((1 - v.coverage) * 100)}% of the shape has no survey data` : ''}
          </div>
        </div>
      </div>
      <p class="hint">
        The ± range is the level of detection ({formatLength(v.lod_m, u, u === 'us' ? 1 : 2).value} {u === 'us' ? 'ft' : 'm'}) applied
        over every cell that counted. It is deliberately cautious.
      </p>
    </div>
  );
}
