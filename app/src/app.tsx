import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import type { Map as MLMap, MapMouseEvent } from 'maplibre-gl';
import { createMapPair, type MapPair } from './map/createMap';
import { createMeasure, type Measure } from './map/measure';
import { loadSite, sampleAt } from './data/site';
import {
  drape3d, drawing, epoch3d, error, exaggeration, haul, imagery, isPhone, mode, panel, panelOpen, playing, pointer,
  readout, reducedMotion, summary, swipe, timeline,
} from './state';
import { Header } from './ui/Header';
import { Legend } from './ui/Legend';
import { Readout } from './ui/Readout';
import { MeasurePanel } from './ui/MeasurePanel';
import { AboutPanel } from './ui/AboutPanel';
import { HaulPanel } from './ui/HaulPanel';
import { SchedulePanel } from './ui/SchedulePanel';
import { Timeline } from './ui/Timeline';
import { Toolbar } from './ui/Toolbar';
import { Welcome } from './ui/Welcome';
import { DrawHint } from './ui/DrawHint';
import { Coach } from './ui/Coach';
import { PROJECTION_STEPS } from './config';

export function App() {
  const beforeEl = useRef<HTMLDivElement>(null);
  const afterEl = useRef<HTMLDivElement>(null);
  const stageEl = useRef<HTMLDivElement>(null);
  const pair = useRef<MapPair | null>(null);
  const measure = useRef<Measure | null>(null);

  const startDraw = () => { mode.value = 'change'; panel.value = 'measure'; measure.current?.start(); };
  const clearDraw = () => measure.current?.clear();

  useEffect(() => {
    let disposed = false;
    const disposers: Array<() => void> = [];
    // Field view on a phone: open on the change map with the sheet tucked away, so the
    // summary, the colors and the readout are what you see first. 3D stays a tap away.
    if (isPhone) { mode.value = 'change'; panelOpen.value = false; }
    (async () => {
      await loadSite();
      if (disposed || !beforeEl.current || !afterEl.current) return;
      const p = createMapPair(beforeEl.current, afterEl.current, summary.value?.grid.bounds_lonlat);
      pair.current = p;
      if (import.meta.env.DEV) (window as unknown as { __gt: MapPair }).__gt = p;
      await p.ready;
      createMeasure(p.after).then((m) => { if (!disposed) measure.current = m; else m.destroy(); });

      disposers.push(effect(() => {
        const m = mode.value;
        p.setChangeVisible(m === 'change' || (m === '3d' && drape3d.value));
        if (m === 'compare') { if (swipe.value === 0) swipe.value = 0.5; } else { swipe.value = 0; }
      }));
      disposers.push(effect(() => p.setImagery(imagery.value)));
      disposers.push(effect(() => p.setHaul(haul.value, panel.value === 'haul' || panel.value === 'schedule')));
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
        const dur = reducedMotion ? 0 : 900;
        if (on && !was3d) p.after.easeTo({ pitch: 62, bearing: -25, zoom: Math.max(p.after.getZoom(), 13.2), duration: dur });
        if (!on && was3d) p.after.easeTo({ pitch: 0, bearing: 0, duration: dur ? 600 : 0 });
        was3d = on;
      }));
      // Timeline: snap the fraction cleared to the nearest projected step. Terrain and the
      // change map both swap, so the debris visibly thins as the slider moves.
      disposers.push(effect(() => {
        const f = panel.value === 'schedule' ? timeline.value : 0;
        const pct = f * 100;
        const step = pct < PROJECTION_STEPS[0] / 2 ? null : PROJECTION_STEPS.reduce((a, b) => (Math.abs(b - pct) < Math.abs(a - pct) ? b : a));
        p.setProjection(step);
        if (panel.value !== 'schedule') playing.value = false;
      }));
      disposers.push(effect(() => p.setCursor(drawing.value ? 'crosshair' : '')));

      for (const m of [p.before, p.after]) {
        m.on('mousemove', onHover);
        m.on('mouseout', () => { readout.value = null; pointer.value = null; });
      }
    })();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && drawing.value) measure.current?.cancel(); };
    window.addEventListener('keydown', onKey);
    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKey);
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
            <Coach n={1} side="left">Drag this handle. Left is 2013, right is March 24, 2014</Coach>
          </button>
          <span class="swipe-label left" style={{ left: pct }}>2013</span>
          <span class="swipe-label right" style={{ left: pct }}>March 24, 2014</span>
        </>
      )}

      <Header />
      <Toolbar onDraw={startDraw} onClear={clearDraw} />
      <Legend />
      <Readout />
      <Timeline />
      <DrawHint />

      <aside class={`card panel ${panelOpen.value ? '' : 'tucked'}`} aria-label="Details">
        <button type="button" class="sheet-toggle" aria-expanded={panelOpen.value} onClick={() => (panelOpen.value = !panelOpen.value)}>
          {panelOpen.value ? 'Hide details' : 'Measure, plan, schedule, about'}
        </button>
        <div class="tabs coach-anchor" role="tablist">
          <button type="button" role="tab" aria-selected={panel.value === 'measure'} onClick={() => (panel.value = 'measure')} title="Cut and fill for the area you draw">Measure</button>
          <button type="button" role="tab" aria-selected={panel.value === 'haul'} onClick={() => (panel.value = 'haul')} title="What it would take to clear the highway: trucks, pits, routes">Plan a cleanup</button>
          <button type="button" role="tab" aria-selected={panel.value === 'schedule'} onClick={() => (panel.value = 'schedule')} title="Put the cleanup on a calendar with weekends, daylight and weather">Schedule</button>
          <button type="button" role="tab" aria-selected={panel.value === 'about'} onClick={() => (panel.value = 'about')} title="Where every number comes from">About this data</button>
          <Coach n={4} side="below">Measure, then plan the cleanup, then put it on a calendar</Coach>
        </div>
        <div class="panel-body" role="tabpanel" aria-label={panel.value ?? 'details'}>
          {panel.value === 'measure' && <MeasurePanel onDraw={startDraw} onClear={clearDraw} />}
          {panel.value === 'haul' && <HaulPanel />}
          {panel.value === 'schedule' && <SchedulePanel />}
          {panel.value === 'about' && <AboutPanel />}
        </div>
      </aside>

      <Welcome onDraw={startDraw} />
      {error.value && <div class="error" role="alert">{error.value}</div>}
    </div>
  );
}

// Hover sampling: at most one COG read in flight; the latest position wins.
let pending: { lon: number; lat: number } | null = null;
let busy = false;
function onHover(e: MapMouseEvent & { target: MLMap }) {
  pointer.value = { x: e.originalEvent.clientX, y: e.originalEvent.clientY };
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
