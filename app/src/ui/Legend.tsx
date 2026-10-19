import { legend, mode, units } from '../state';
import { formatLength } from '../math/units';

export function Legend() {
  const l = legend.value;
  if (!l || mode.value !== 'change') return null;
  const us = units.value === 'us';
  const lodText = formatLength(l.lod_m, units.value, us ? 1 : 2);
  const gainColor = l.classes.find((c) => c.kind === 'gain')?.color ?? '#fdb863';
  return (
    <section class="card legend" aria-label="Legend">
      <h3>Elevation change, 2013 to March 24, 2014</h3>
      <ol>
        {l.classes.map((c) => (
          <li key={c.label_m}>
            <span class="sw" style={{ background: c.color, opacity: c.alpha / 255 }} aria-hidden="true" />
            <span>{us ? c.label_ft : c.label_m}</span>
          </li>
        ))}
        <li>
          <span class="sw hatch" style={{ backgroundColor: gainColor }} aria-hidden="true" />
          <span>{l.water.label}</span>
        </li>
      </ol>
      <p>
        Lower means ground was removed; higher means material was added. Changes within {lodText.value} {lodText.unit}
        {' '}are inside the surveys' combined error, so they are shown as no detectable change.
      </p>
    </section>
  );
}
