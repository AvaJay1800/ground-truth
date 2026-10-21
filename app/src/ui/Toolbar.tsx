import { drawing, help, volume, welcome, writePref } from '../state';
import { Coach } from './Coach';

interface Props { onDraw(): void; onClear(): void; }

/** Tools that act on the map live on the map, beside the zoom buttons. */
export function Toolbar({ onDraw, onClear }: Props) {
  const toggleHelp = () => { help.value = !help.value; writePref('gt.help', help.value ? '1' : '0'); if (help.value) welcome.value = true; };
  return (
    <div class="toolbar" role="toolbar" aria-label="Map tools">
      <button type="button" class="tool" aria-pressed={drawing.value} onClick={drawing.value ? onClear : onDraw} title={drawing.value ? 'Cancel drawing' : 'Draw an area to measure cut and fill'} aria-label={drawing.value ? 'Cancel drawing' : 'Draw an area'}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 5l9-2 3 7-5 7-7-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /><circle cx="4" cy="5" r="1.8" fill="currentColor" /><circle cx="13" cy="3" r="1.8" fill="currentColor" /><circle cx="16" cy="10" r="1.8" fill="currentColor" /><circle cx="11" cy="17" r="1.8" fill="currentColor" /><circle cx="4" cy="14" r="1.8" fill="currentColor" /></svg>
      </button>
      <button type="button" class="tool" onClick={onClear} disabled={!volume.value && !drawing.value} title="Clear the drawn area" aria-label="Clear the drawn area">
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      </button>
      <button type="button" class="tool" aria-pressed={help.value} onClick={toggleHelp} title={help.value ? 'Hide hints' : 'Show hints'} aria-label={help.value ? 'Hide hints' : 'Show hints'}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M7.5 7.8a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1.9-1.1 1.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><circle cx="10" cy="14.6" r="1.1" fill="currentColor" /></svg>
      </button>
      <Coach n={3} side="right">Draw an area to measure how much moved</Coach>
    </div>
  );
}
