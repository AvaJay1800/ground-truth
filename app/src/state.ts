import { signal, computed } from '@preact/signals';
import type { UnitSystem } from './math/units';
import type { VolumeResult } from './math/volume';

export type ViewMode = 'compare' | 'change' | '3d';
export type Epoch = 'before' | 'after';
export type Panel = 'measure' | 'about' | null;

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
