import { help, welcome, writePref } from '../state';

interface Props { onDraw(): void; }

/** First-visit card. Three things to try, then out of the way. */
export function Welcome({ onDraw }: Props) {
  if (!welcome.value) return null;
  const close = (hints: boolean) => {
    welcome.value = false;
    help.value = hints;
    writePref('gt.visited', '1');
    writePref('gt.help', hints ? '1' : '0');
  };
  return (
    <div class="welcome-backdrop" onClick={() => close(help.value)}>
      <section class="card welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="welcome-title">Three things to try</h2>
        <ol>
          <li><b>Drag the handle.</b> The left side is the valley in 2013; the right side is two days after the slide.</li>
          <li><b>See what changed.</b> Blue is ground that dropped, orange is debris that piled up. Hover for exact numbers.</li>
          <li><b>Draw an area.</b> Get cut, fill and an honest ± for any shape. Then plan the cleanup and put it on a calendar.</li>
        </ol>
        <p class="hint">Everything is measured from two laser surveys, with every assumption labeled. Nothing here is simulated except the cleanup, which says so.</p>
        <div class="row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" class="btn primary" onClick={() => { close(true); }}>Show me with hints</button>
          <button type="button" class="btn" onClick={() => { close(true); onDraw(); }}>Jump to drawing</button>
          <button type="button" class="btn" onClick={() => close(false)}>Just explore</button>
        </div>
      </section>
    </div>
  );
}
