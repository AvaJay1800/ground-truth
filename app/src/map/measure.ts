// Polygon drawing with Terra Draw on the "after" map, and the volume computation
// that follows a finished polygon.
import type { Map as MLMap } from 'maplibre-gl';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { diffWindow } from '../data/site';
import { lonLatToUtm } from '../math/utm';
import { polygonVolume, type Ring } from '../math/volume';
import { drawing, lod, volume, volumeBusy, error } from '../state';

export interface Measure {
  start(): void;
  clear(): void;
  destroy(): void;
}

export function createMeasure(map: MLMap): Measure {
  const draw = new TerraDraw({
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

  draw.on('finish', async (id, context) => {
    if (context.action !== 'draw') return;
    drawing.value = false;
    draw.setMode('select');
    const feature = draw.getSnapshotFeature(id);
    if (!feature || feature.geometry.type !== 'Polygon') return;
    const lonlat = feature.geometry.coordinates[0] as Array<[number, number]>;
    await measure(lonlat);
  });

  return {
    start() {
      draw.clear();
      volume.value = null;
      drawing.value = true;
      draw.setMode('polygon');
    },
    clear() {
      draw.clear();
      volume.value = null;
      drawing.value = false;
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
