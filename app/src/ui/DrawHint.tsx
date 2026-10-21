import { drawVertices, drawing, pointer } from '../state';

/** A pill that follows the pointer while drawing and says what the next click does. */
export function DrawHint() {
  if (!drawing.value || !pointer.value) return null;
  const n = drawVertices.value;
  const text = n === 0 ? 'Click to place the first corner'
    : n < 3 ? `Click to add a corner (${n} placed)`
    : 'Click to add a corner, or click the first corner to finish';
  return (
    <div class="draw-hint" style={{ left: pointer.value.x + 16, top: pointer.value.y + 18 }} role="status" aria-live="polite">
      {text} <span class="muted">· Esc cancels</span>
    </div>
  );
}
