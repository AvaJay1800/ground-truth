import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import type { Map as MLMap, MapMouseEvent } from 'maplibre-gl';
import { createMapPair, type MapPair } from './map/createMap';
import { createMeasure, type Measure } from './map/measure';
import { loadSite, sampleAt } from './data/site';
import { error, imagery, mode, panel, readout, summary, swipe } from './state';
import { Header } from './ui/Header';
import { Legend } from './ui/Legend';
import { Readout } from './ui/Readout';
import { MeasurePanel } from './ui/MeasurePanel';
import { AboutPanel } from './ui/AboutPanel';

export function App() {
  const beforeEl = useRef<HTMLDivElement>(null);
  const afterEl = useRef<HTMLDivElement>(null);
  const stageEl = useRef<HTMLDivElement>(null);
  const pair = useRef<MapPair | null>(null);
  const measure = useRef<Measure | null>(null);

  useEffect(() => {
    let disposed = false;
    const disposers: Array<() => void> = [];
    (async () => {
      await loadSite();
      if (disposed || !beforeEl.current || !afterEl.current) return;
      const p = createMapPair(beforeEl.current, afterEl.current, summary.value?.grid.bounds_lonlat);
      pair.current = p;
      if (import.meta.env.DEV) (window as unknown as { __gt: MapPair }).__gt = p;
      await p.ready;
      measure.current = createMeasure(p.after);

      disposers.push(effect(() => {
        p.setChangeVisible(mode.value === 'change');
        if (mode.value === 'change') { swipe.value = 0; } else if (swipe.value === 0) { swipe.value = 0.5; }
      }));
      disposers.push(effect(() => p.setImagery(imagery.value)));

      for (const m of [p.before, p.after]) {
        m.on('mousemove', onHover);
        m.on('mouseout', () => (readout.value = null));
      }
    })();
    return () => {
      disposed = true;
      disposers.forEach((d) => d());
      measure.current?.destroy();
      pair.current?.destroy();
    };
  }, []);

  // Swipe handle: pointer drag anywhere on the handle column.
  const onSwipePointer = (e: PointerEvent) => {
    const stage = stageEl.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const move = (ev: PointerEvent) => { swipe.value = Math.min(0.98, Math.max(0.02, (ev.clientX - rect.left) / rect.width)); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    move(e);
  };
  const onSwipeKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') swipe.value = Math.max(0.02, swipe.value - 0.03);
    if (e.key === 'ArrowRight') swipe.value = Math.min(0.98, swipe.value + 0.03);
  };

  const compare = mode.value === 'compare';
  const pct = `${(swipe.value * 100).toFixed(2)}%`;

  return (
    <div class="stage" ref={stageEl}>
      <div class="map after" ref={afterEl} aria-label="Map, March 24, 2014" />
      <div class={`map before ${compare ? '' : 'hidden'}`} ref={beforeEl} aria-label="Map, 2013" style={{ clipPath: `inset(0 ${(100 - swipe.value * 100).toFixed(2)}% 0 0)` }} />
      {compare && (
        <>
          <button type="button" class="swipe" style={{ left: pct }} onPointerDown={onSwipePointer as unknown as (e: Event) => void} onKeyDown={onSwipeKey as unknown as (e: Event) => void}
            aria-label="Swipe between 2013 and 2014" role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(swipe.value * 100)}>
            <span class="swipe-knob" aria-hidden="true">◀▶</span>
          </button>
          <span class="swipe-label left" style={{ left: pct }}>2013</span>
          <span class="swipe-label right" style={{ left: pct }}>March 24, 2014</span>
        </>
      )}

      <Header />
      <Legend />
      <Readout />

      <aside class="card panel" aria-label="Details">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={panel.value === 'measure'} onClick={() => (panel.value = 'measure')}>Measure</button>
          <button type="button" role="tab" aria-selected={panel.value === 'about'} onClick={() => (panel.value = 'about')}>About this data</button>
        </div>
        <div class="panel-body" role="tabpanel">
          {panel.value === 'measure'
            ? <MeasurePanel onDraw={() => { mode.value = 'change'; measure.current?.start(); }} onClear={() => measure.current?.clear()} />
            : <AboutPanel />}
        </div>
      </aside>

      {error.value && <div class="error" role="alert">{error.value}</div>}
    </div>
  );
}

// Hover sampling: at most one COG read in flight; the latest position wins.
let pending: { lon: number; lat: number } | null = null;
let busy = false;
function onHover(e: MapMouseEvent & { target: MLMap }) {
  pending = { lon: e.lngLat.lng, lat: e.lngLat.lat };
  if (busy) return;
  busy = true;
  (async () => {
    while (pending) {
      const p = pending; pending = null;
      try { readout.value = await sampleAt(p.lon, p.lat); } catch { /* keep the last reading */ }
    }
    busy = false;
  })();
}
