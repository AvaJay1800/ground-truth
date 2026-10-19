// Two MapLibre maps, one per survey, kept in lockstep. The "before" map sits on top
// and is clipped to the left of the swipe handle; the "after" map shows through on
// the right and carries the change layer and the drawing tools.
import { Map as MLMap, NavigationControl, ScaleControl, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BASEMAP_STYLE, DATA, IMAGERY_ATTRIBUTION, IMAGERY_TILES, INITIAL_VIEW } from '../config';

export type Epoch = 'before' | 'after';

export interface MapPair {
  before: MLMap;
  after: MLMap;
  ready: Promise<void>;
  setChangeVisible(v: boolean): void;
  setImagery(v: boolean): void;
  /** Turn 3D terrain on the "after" map on or off, built from the given survey. */
  setTerrain(epoch: Epoch | null, exaggeration: number): void;
  destroy(): void;
}

const DEM_BOUNDS_FALLBACK: [number, number, number, number] = [-121.95, 48.22, -121.75, 48.33];

export function createMapPair(beforeEl: HTMLElement, afterEl: HTMLElement, bounds?: number[]): MapPair {
  const b = (bounds ?? DEM_BOUNDS_FALLBACK) as [number, number, number, number];
  const before = baseMap(beforeEl);
  const after = baseMap(afterEl);

  const ready = Promise.all([
    whenLoaded(before).then(() => addEpochLayers(before, 'before', b)),
    whenLoaded(after).then(() => {
      // The "after" map also carries the 2013 surface, hidden, so the 3D view can switch
      // between the two without a second map.
      addEpochLayers(after, 'before', b, 'dem-before', 'hillshade-before', false);
      addEpochLayers(after, 'after', b);
      addChangeLayer(after, b);
    }),
  ]).then(() => undefined);

  let syncing = false;
  const follow = (src: MLMap, dst: MLMap) => () => {
    if (syncing) return;
    syncing = true;
    dst.jumpTo({ center: src.getCenter(), zoom: src.getZoom(), bearing: src.getBearing(), pitch: src.getPitch() });
    syncing = false;
  };
  before.on('move', follow(before, after));
  after.on('move', follow(after, before));

  return {
    before, after, ready,
    setChangeVisible(v) {
      if (after.getLayer('change')) after.setLayoutProperty('change', 'visibility', v ? 'visible' : 'none');
    },
    setImagery(v) {
      for (const m of [before, after]) {
        if (!m.getSource('imagery')) {
          m.addSource('imagery', { type: 'raster', tiles: [IMAGERY_TILES], tileSize: 256, maxzoom: 16, attribution: IMAGERY_ATTRIBUTION });
          m.addLayer({ id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-opacity': 0.9 } }, firstSymbolLayer(m));
        }
        m.setLayoutProperty('imagery', 'visibility', v ? 'visible' : 'none');
      }
    },
    setTerrain(epoch, exaggeration) {
      if (!after.getSource('dem')) return;
      if (!epoch) {
        after.setTerrain(null);
        after.setSky({ 'sky-color': 'rgba(0,0,0,0)', 'horizon-color': 'rgba(0,0,0,0)', 'fog-color': 'rgba(0,0,0,0)' } as never);
        after.setLayoutProperty('hillshade', 'visibility', 'visible');
        after.setLayoutProperty('hillshade-before', 'visibility', 'none');
        return;
      }
      after.setTerrain({ source: epoch === 'before' ? 'dem-before' : 'dem', exaggeration });
      after.setSky({
        'sky-color': '#c9d6e3', 'horizon-color': '#e8edf2', 'fog-color': '#dfe5ec',
        'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.25,
      });
      after.setLayoutProperty('hillshade', 'visibility', epoch === 'after' ? 'visible' : 'none');
      after.setLayoutProperty('hillshade-before', 'visibility', epoch === 'before' ? 'visible' : 'none');
    },
    destroy() { before.remove(); after.remove(); },
  };
}

function baseMap(container: HTMLElement): MLMap {
  const map = new MLMap({
    container,
    style: BASEMAP_STYLE as unknown as StyleSpecification | string,
    center: INITIAL_VIEW.center,
    zoom: INITIAL_VIEW.zoom,
    minZoom: 10,
    maxZoom: 18,
    attributionControl: { compact: true },
    cooperativeGestures: false,
  });
  map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new ScaleControl({ unit: 'imperial' }), 'bottom-right');
  return map;
}

function whenLoaded(map: MLMap): Promise<void> {
  return new Promise((resolve) => (map.loaded() ? resolve() : map.once('load', () => resolve())));
}

function firstSymbolLayer(map: MLMap): string | undefined {
  return map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
}

function addEpochLayers(
  map: MLMap, epoch: Epoch, bounds: [number, number, number, number],
  sourceId = 'dem', layerId = 'hillshade', visible = true,
): void {
  map.addSource(sourceId, {
    type: 'raster-dem',
    tiles: [DATA.tiles(epoch)],
    tileSize: 256,
    encoding: 'mapbox',
    minzoom: 10,
    maxzoom: 16,
    bounds,
    attribution: epoch === 'before'
      ? 'Lidar: Puget Sound LiDAR Consortium 2013 via Washington DNR'
      : 'Lidar: WSDOT / Quantum Spatial, March 24, 2014 via Washington DNR',
  });
  map.addLayer({
    id: layerId,
    type: 'hillshade',
    source: sourceId,
    layout: { visibility: visible ? 'visible' : 'none' },
    paint: {
      'hillshade-exaggeration': 0.6,
      'hillshade-shadow-color': '#2b2f36',
      'hillshade-highlight-color': '#ffffff',
      'hillshade-accent-color': '#5c6370',
      'hillshade-illumination-direction': 315,
    },
  }, firstSymbolLayer(map));
}

function addChangeLayer(map: MLMap, bounds: [number, number, number, number]): void {
  map.addSource('change', { type: 'raster', tiles: [DATA.tiles('change')], tileSize: 256, minzoom: 10, maxzoom: 16, bounds });
  map.addLayer({
    id: 'change',
    type: 'raster',
    source: 'change',
    layout: { visibility: 'none' },
    paint: { 'raster-opacity': 0.82, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 },
  }, firstSymbolLayer(map));
}
