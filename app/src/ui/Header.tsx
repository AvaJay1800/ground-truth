import { drape3d, epoch3d, exaggeration, imagery, mode, panel, summary, units } from '../state';
import { summaryText } from '../content/summaryText';

export function Header() {
  const s = summary.value;
  const text = s ? summaryText(s, units.value) : null;
  return (
    <header class="card header">
      <h1>Ground Truth</h1>
      <p>Oso, Washington. Bare-earth lidar, summer 2013 against March 24, 2014, two days after the slide.</p>
      {text && (
        <div class="summary">
          <p class="lead">{text.headline}</p>
          <details>
            <summary>More, and how we know</summary>
            <p>{text.detail}</p>
            <p>{text.caveat} <button type="button" class="link" onClick={() => (panel.value = 'about')}>About this data</button></p>
          </details>
        </div>
      )}
      <div class="row">
        <div class="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={mode.value === 'compare'} onClick={() => (mode.value = 'compare')}>Before / after</button>
          <button type="button" aria-pressed={mode.value === 'change'} onClick={() => (mode.value = 'change')}>What changed</button>
          <button type="button" aria-pressed={mode.value === '3d'} onClick={() => (mode.value = '3d')}>3D</button>
        </div>
        <div class="seg" role="group" aria-label="Units">
          <button type="button" aria-pressed={units.value === 'us'} onClick={() => (units.value = 'us')}>ft · yd³</button>
          <button type="button" aria-pressed={units.value === 'metric'} onClick={() => (units.value = 'metric')}>m · m³</button>
        </div>
        <label class="check">
          <input type="checkbox" checked={imagery.value} onChange={(e) => (imagery.value = (e.target as HTMLInputElement).checked)} />
          Aerial photo (current)
        </label>
      </div>
      {mode.value === '3d' && (
        <div class="row" aria-label="3D settings">
          <div class="seg" role="group" aria-label="Surface">
            <button type="button" aria-pressed={epoch3d.value === 'before'} onClick={() => (epoch3d.value = 'before')}>2013 surface</button>
            <button type="button" aria-pressed={epoch3d.value === 'after'} onClick={() => (epoch3d.value = 'after')}>March 24, 2014</button>
          </div>
          <label class="check">
            <input type="checkbox" checked={drape3d.value} onChange={(e) => (drape3d.value = (e.target as HTMLInputElement).checked)} />
            Change colors
          </label>
          <label class="check">
            Heights ×
            <select value={String(exaggeration.value)} onChange={(e) => (exaggeration.value = Number((e.target as HTMLSelectElement).value))} aria-label="Vertical exaggeration">
              <option value="1">1</option>
              <option value="1.3">1.3</option>
              <option value="2">2</option>
            </select>
          </label>
        </div>
      )}
    </header>
  );
}
