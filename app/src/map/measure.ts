// Polygon drawing with Terra Draw on the "after" map, and the volume computation
// that follows a finished polygon.
import type { Map as MLMap } from 'maplibre-gl';
import type { TerraDraw } from 'terra-draw';
import { diffWindow } from '../data/site';
import { lonLatToUtm } from '../math/utm';
import { polygonVolume, type Ring } from '../math/volume';
import { drawVertices, drawing, lod, panel, panelOpen, volume, volumeBusy, error } from '../state';

export interface Measure {
  start(): void;
  /** Stop drawing and drop any unfinished shape; a finished result stays. */
  cancel(): void;
  clear(): void;
  destroy(): void;
}

/** Terra Draw loads on first use, so the first paint does not pay for it. */
export async function createMeasure(map: MLMap): Promise<Measure> {
  const [{ TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode }, { TerraDrawMapLibreGLAdapter }] = await Promise.all([
    import('terra-draw'), import('terra-draw-maplibre-gl-adapter'),
  ]);
  const draw: TerraDraw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawPolygonMode({
        styles: {
          fillColor: '#1c1f24', fillOpacity: 0.08,
          outlineColor: '#1c1f24', outlineWidth: 2,
          closingPointColor: '#1c1f24', closingPointOutlineColor: '#ffffff', closingPointWidth: 5, closingPointOutlineWidth: 2,
        },
      }),
      new TerraDrawSelectMode({ flags: { polygon: { feature: { draggable: false, coordinates: { midpoints: false, draggable: false, deletable: false } } } } }),
    ],
  });
  draw.start();
  draw.setMode('select');
  if (import.meta.env.DEV) (window as unknown as { __td: TerraDraw }).__td = draw;

  // Count the corners placed so far so the pointer hint can say what to do next.
  draw.on('change', () => {
    if (!drawing.value) return;
    const f = draw.getSnapshot().find((x) => x.geometry.type === 'Polygon');
    if (!f || f.geometry.type !== 'Polygon') { drawVertices.value = 0; return; }
    const ring = f.geometry.coordinates[0].slice(0, -1);
    const distinct = new Set(ring.map((c) => c.join(','))).size;
    drawVertices.value = distinct;
  });

  draw.on('finish', async (id, context) => {
    if (context.action !== 'draw') return;
    drawing.value = false;
    drawVertices.value = 0;
    draw.setMode('select');
    const feature = draw.getSnapshotFeature(id);
    if (!feature || feature.geometry.type !== 'Polygon') return;
    const lonlat = feature.geometry.coordinates[0] as Array<[number, number]>;
    panel.value = 'measure';
    panelOpen.value = true;
    await measure(lonlat);
  });

  return {
    start() {
      draw.clear();
      volume.value = null;
      drawing.value = true;
      drawVertices.value = 0;
      draw.setMode('polygon');
    },
    cancel() {
      if (!drawing.value) return;
      draw.clear();
      drawing.value = false;
      drawVertices.value = 0;
      draw.setMode('select');
    },
    clear() {
      draw.clear();
      volume.value = null;
      drawing.value = false;
      drawVertices.value = 0;
      draw.setMode('select');
    },
    destroy() { draw.stop(); },
  };
}

export async function measure(lonlat: Array<[number, number]>): Promise<void> {
  volumeBusy.value = true;
  try {
    const ring: Ring = lonlat.map(([lon, lat]) => { const p = lonLatToUtm(lon, lat); return [p.x, p.y]; });
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    const win = await diffWindow(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    if (!win) { volume.value = null; error.value = 'That area is outside the surveyed ground.'; return; }
    volume.value = polygonVolume(win.diff, ring, lod.value, win.water ?? undefined);
    error.value = null;
  } catch (e) {
    error.value = `Could not measure that area: ${(e as Error).message}`;
  } finally {
    volumeBusy.value = false;
  }
}
