import { imagery, mode, units } from '../state';

export function Header() {
  return (
    <header class="card header">
      <h1>Ground Truth</h1>
      <p>Oso, Washington. Bare-earth lidar, summer 2013 against March 24, 2014, two days after the slide.</p>
      <div class="row">
        <div class="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={mode.value === 'compare'} onClick={() => (mode.value = 'compare')}>Before / after</button>
          <button type="button" aria-pressed={mode.value === 'change'} onClick={() => (mode.value = 'change')}>What changed</button>
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
    </header>
  );
}
