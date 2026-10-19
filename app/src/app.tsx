import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import type { Map as MLMap, MapMouseEvent } from 'maplibre-gl';
import { createMapPair, type MapPair } from './map/createMap';
import { createMeasure, type Measure } from './map/measure';
import { loadSite, sampleAt } from './data/site';
import { drape3d, epoch3d, error, exaggeration, haul, imagery, mode, panel, readout, summary, swipe } from './state';
import { HaulPanel } from './ui/HaulPanel';
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
        const m = mode.value;
        p.setChangeVisible(m === 'change' || (m === '3d' && drape3d.value));
        if (m === 'compare') { if (swipe.value === 0) swipe.value = 0.5; } else { swipe.value = 0; }
      }));
      disposers.push(effect(() => p.setImagery(imagery.value)));
      disposers.push(effect(() => p.setHaul(haul.value, panel.value === 'haul')));
      // Opening the cleanup tab frames the whole haul: corridor, both pits, the roads between.
      let framed = false;
      disposers.push(effect(() => {
        if (panel.value === 'haul' && haul.value && !framed) { framed = true; p.fitHaul(haul.value); }
        if (panel.value !== 'haul') framed = false;
      }));
      // 3D: terrain from the chosen survey, a tilted camera on the way in, flat on the way out.
      let was3d = false;
      disposers.push(effect(() => {
        const on = mode.value === '3d';
        p.setTerrain(on ? epoch3d.value : null, exaggeration.value);
        if (on && !was3d) p.after.easeTo({ pitch: 62, bearing: -25, zoom: Math.max(p.after.getZoom(), 13.2), duration: 900 });
        if (!on && was3d) p.after.easeTo({ pitch: 0, bearing: 0, duration: 600 });
        was3d = on;
      }));

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
          <button type="button" role="tab" aria-selected={panel.value === 'haul'} onClick={() => (panel.value = 'haul')}>Plan a cleanup</button>
          <button type="button" role="tab" aria-selected={panel.value === 'about'} onClick={() => (panel.value = 'about')}>About this data</button>
        </div>
        <div class="panel-body" role="tabpanel">
          {panel.value === 'measure' && <MeasurePanel onDraw={() => { mode.value = 'change'; measure.current?.start(); }} onClear={() => measure.current?.clear()} />}
          {panel.value === 'haul' && <HaulPanel />}
          {panel.value === 'about' && <AboutPanel />}
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
