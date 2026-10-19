import { signal, computed } from '@preact/signals';
import type { Geometry } from 'geojson';
import type { UnitSystem } from './math/units';
import type { VolumeResult } from './math/volume';

export type ViewMode = 'compare' | 'change' | '3d';
export type Epoch = 'before' | 'after';
export type Panel = 'measure' | 'haul' | 'about' | null;

export interface HaulRoute { distance_m: number; duration_s: number; geometry: { type: 'LineString'; coordinates: number[][] } }
export interface HaulSite {
  id: 'disposal' | 'borrow'; role: 'disposal' | 'borrow'; name: string; lon: number; lat: number;
  permit: number; applicant: string; commodity: string; permit_acres: number; why: string;
}
export interface HaulData {
  generated: string;
  framing: string;
  origin_lonlat: [number, number];
  corridor: {
    geometry: Geometry; half_width_m: number; source: string;
    volumes: Totals & { corridor_area_m2: number; water_cells: number; cell_area_m2: number };
  };
  sites: HaulSite[];
  sites_source: { name: string; url: string; fetched: string };
  routes: Record<'disposal' | 'borrow', { out: HaulRoute; back: HaulRoute; round_trip_km: number; round_trip_min_car: number }>;
  routing: { engine: string; url: string; fetched: string; note: string };
}

export interface Summary {
  generated: string;
  crs: string;
  cell_m: number;
  grid: { width: number; height: number; bounds_utm: number[]; bounds_lonlat: number[] };
  before: { name: string; flown: string; sigma95_m: number };
  after: { name: string; flown: string; sigma95_m: number };
  vertical_bias_removed_m: number;
  stable_ground: { cells: number; nmad_m: number };
  lod: { lod_m: number; stated_m: number; empirical_m: number; basis: string };
  water: { found: boolean; pool_elev_m: number | null; area_m2: number; volume_m3: number; mean_depth_m: number };
  totals: Totals;
  totals_over_1m: Totals;
  max_loss_m: number;
  max_gain_m: number;
}

export interface Totals {
  cut_m3: number; fill_m3: number; net_m3: number;
  cut_area_m2: number; fill_area_m2: number; area_changed_m2: number;
  cut_uncertainty_m3: number; fill_uncertainty_m3: number; net_uncertainty_m3: number;
}

export interface LegendClass {
  kind: 'loss' | 'none' | 'gain';
  min_m: number | null; max_m: number | null;
  color: string; alpha: number;
  label_ft: string; label_m: string;
}

export interface Legend {
  lod_m: number;
  zoom: { min: number; max: number };
  bounds_lonlat: number[];
  classes: LegendClass[];
  water: { pool_elev_m: number; label: string };
}

export interface Readout {
  lon: number; lat: number;
  before_m: number; after_m: number; diff_m: number;
  water: boolean;
}

export const units = signal<UnitSystem>('us');
export const mode = signal<ViewMode>('compare');
export const panel = signal<Panel>('measure');
export const swipe = signal(0.5);           // fraction of width showing "before"
export const imagery = signal(false);
// 3D view settings: which surface the terrain is built from, whether the change
// colors are draped on it, and how much the heights are stretched.
export const epoch3d = signal<Epoch>('after');
export const drape3d = signal(true);
export const exaggeration = signal(1.3);
export const summary = signal<Summary | null>(null);
export const legend = signal<Legend | null>(null);
export const readout = signal<Readout | null>(null);
export const drawing = signal(false);
export const volume = signal<VolumeResult | null>(null);
export const volumeBusy = signal(false);
export const error = signal<string | null>(null);

export const lod = computed(() => summary.value?.lod.lod_m ?? 0.1);

// Phase 3: the what-if cleanup. Data from haul.json plus the user's choices.
export const haul = signal<HaulData | null>(null);
export const haulScope = signal<'corridor' | 'drawn'>('corridor');
export const soilId = signal('earth_wet');
export const swellOverride = signal<number | null>(null);
export const shrinkOverride = signal<number | null>(null);
export const truckId = signal('adt');
export const capacityOverride = signal<number | null>(null);
export const payloadOverride = signal<number | null>(null);
export const nTrucks = signal(8);
export const hoursPerDay = signal(10);
export const loadMin = signal(5);
export const dumpMin = signal(2);
export const speedFactor = signal(0.8);
export const efficiency = signal(0.83);
