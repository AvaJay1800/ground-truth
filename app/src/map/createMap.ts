// Two MapLibre maps, one per survey, kept in lockstep. The "before" map sits on top
// and is clipped to the left of the swipe handle; the "after" map shows through on
// the right and carries the change layer and the drawing tools.
import { Map as MLMap, NavigationControl, ScaleControl, type RasterDEMTileSource, type RasterTileSource, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import { BASEMAP_STYLE, DATA, IMAGERY_ATTRIBUTION, IMAGERY_TILES, INITIAL_VIEW } from '../config';
import type { HaulData } from '../state';

export type Epoch = 'before' | 'after';

export interface MapPair {
  before: MLMap;
  after: MLMap;
  ready: Promise<void>;
  setChangeVisible(v: boolean): void;
  setImagery(v: boolean): void;
  /** Turn 3D terrain on the "after" map on or off, built from the given survey. */
  setTerrain(epoch: Epoch | null, exaggeration: number): void;
  /** Add (once) the what-if cleanup corridor, haul routes and sites; then show or hide them. */
  setHaul(data: HaulData | null, visible: boolean): void;
  /** Swap the 2014 terrain and change map for a projected "percent cleared" step (null = measured). */
  setProjection(step: number | null): void;
  /** Cursor over the map canvas, e.g. 'crosshair' while drawing. */
  setCursor(cursor: string): void;
  /** Frame the corridor, both pits and the roads between them. */
  fitHaul(data: HaulData, padding?: { top: number; right: number; bottom: number; left: number }): void;
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
    setHaul(data, visible) {
      // isStyleLoaded() flips false during any pending style change, so it is not a safe gate here;
      // the terrain source existing means the style has loaded and the epoch layers are in.
      // Both maps carry the haul layers so the routes show on either side of the swipe handle.
      for (const m of [before, after]) {
        if (!data || !m.getSource('dem')) continue;
        if (!m.getSource('haul-corridor')) addHaulLayers(m, data);
        for (const id of HAUL_LAYERS) m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    },
    setProjection(step) {
      // MapLibre lets a tile source change its URLs in place; hillshade, 3D terrain and the
      // change layer all re-render from the new tiles. The before map is untouched.
      const dem = after.getSource('dem') as (RasterDEMTileSource | undefined);
      const change = after.getSource('change') as (RasterTileSource | undefined);
      if (!dem || !change) return;
      const demUrl = step ? DATA.projectionTiles(step) : DATA.tiles('after');
      const changeUrl = step ? DATA.projectionChangeTiles(step) : DATA.tiles('change');
      if (dem.tiles?.[0] !== demUrl) dem.setTiles([demUrl]);
      if (change.tiles?.[0] !== changeUrl) change.setTiles([changeUrl]);
    },
    setCursor(cursor) {
      after.getCanvas().style.cursor = cursor;
    },
    fitHaul(data, padding = { top: 80, right: 420, bottom: 60, left: 40 }) {
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      const take = ([x, y]: number[]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); };
      for (const k of ['disposal', 'borrow'] as const) data.routes[k].out.geometry.coordinates.forEach(take);
      data.sites.forEach((site) => take([site.lon, site.lat]));
      if (!Number.isFinite(w)) return;
      after.fitBounds([[w, s], [e, n]], { padding, pitch: 0, bearing: 0, duration: 900 });
    },
    destroy() { before.remove(); after.remove(); },
  };
}

const HAUL_LAYERS = ['haul-corridor-fill', 'haul-corridor-line', 'haul-route-disposal', 'haul-route-borrow', 'haul-sites', 'haul-site-labels'];

function addHaulLayers(map: MLMap, h: HaulData): void {
  map.addSource('haul-corridor', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: h.corridor.geometry } });
  const routes: FeatureCollection = {
    type: 'FeatureCollection',
    features: (['disposal', 'borrow'] as const).map((k) => ({
      type: 'Feature', properties: { role: k }, geometry: h.routes[k].out.geometry,
    })),
  };
  map.addSource('haul-routes', { type: 'geojson', data: routes });
  const sites: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      ...h.sites.map((s) => ({ type: 'Feature' as const, properties: { role: s.role, label: s.role === 'disposal' ? 'Disposal (what-if)' : 'Borrow (what-if)' }, geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] } })),
      { type: 'Feature', properties: { role: 'origin', label: 'Cleanup scope' }, geometry: { type: 'Point', coordinates: h.origin_lonlat } },
    ],
  };
  map.addSource('haul-sites', { type: 'geojson', data: sites });
  const before = firstSymbolLayer(map);
  map.addLayer({ id: 'haul-corridor-fill', type: 'fill', source: 'haul-corridor', layout: { visibility: 'none' }, paint: { 'fill-color': '#1c1f24', 'fill-opacity': 0.12 } }, before);
  map.addLayer({ id: 'haul-corridor-line', type: 'line', source: 'haul-corridor', layout: { visibility: 'none' }, paint: { 'line-color': '#1c1f24', 'line-width': 2, 'line-dasharray': [2, 1.5] } }, before);
  map.addLayer({ id: 'haul-route-disposal', type: 'line', source: 'haul-routes', filter: ['==', ['get', 'role'], 'disposal'], layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1c1f24', 'line-width': 4, 'line-opacity': 0.85 } }, before);
  map.addLayer({ id: 'haul-route-borrow', type: 'line', source: 'haul-routes', filter: ['==', ['get', 'role'], 'borrow'], layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1c1f24', 'line-width': 4, 'line-opacity': 0.85, 'line-dasharray': [1, 2] } }, before);
  map.addLayer({ id: 'haul-sites', type: 'circle', source: 'haul-sites', layout: { visibility: 'none' }, paint: { 'circle-radius': 7, 'circle-color': '#fcfbf9', 'circle-stroke-color': '#1c1f24', 'circle-stroke-width': 2.5 } });
  map.addLayer({
    id: 'haul-site-labels', type: 'symbol', source: 'haul-sites',
    layout: { visibility: 'none', 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-font': ['Noto Sans Bold'] },
    paint: { 'text-color': '#1c1f24', 'text-halo-color': '#fcfbf9', 'text-halo-width': 1.5 },
  });
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
