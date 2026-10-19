// Loads the pipeline's JSON and opens the rasters once; everything else asks here.
import { DATA } from '../config';
import { climate, haul, legend, summary, error } from '../state';
import type { Cog } from './cog';
import { lonLatToUtm } from '../math/utm';
import type { Grid } from '../math/volume';

// geotiff.js and its decoders are only needed once someone hovers or draws, so they load then.
const cogModule = () => import('./cog');

let cogs: Promise<{ before: Cog; after: Cog; diff: Cog; water: Cog }> | null = null;

export async function loadSite(): Promise<void> {
  try {
    const [s, l] = await Promise.all([
      fetch(DATA.summary).then((r) => r.json()),
      fetch(DATA.legend).then((r) => r.json()),
    ]);
    summary.value = s;
    legend.value = l;
    // The cleanup what-if is optional: the viewer works without it.
    try { haul.value = await fetch(DATA.haul).then((r) => (r.ok ? r.json() : null)); } catch { haul.value = null; }
    try { climate.value = await fetch(DATA.climate).then((r) => (r.ok ? r.json() : null)); } catch { climate.value = null; }
  } catch (e) {
    error.value = `Could not load the site data (${(e as Error).message}). Run the pipeline first.`;
  }
}

function rasters() {
  if (!cogs) {
    cogs = (async () => {
      const { openCog } = await cogModule();
      const [before, after, diff, water] = await Promise.all([
        openCog(DATA.before), openCog(DATA.after), openCog(DATA.diff), openCog(DATA.water),
      ]);
      return { before, after, diff, water };
    })();
  }
  return cogs;
}

export async function sampleAt(lon: number, lat: number) {
  const { x, y } = lonLatToUtm(lon, lat);
  const [r, { pointValue }] = await Promise.all([rasters(), cogModule()]);
  const [before_m, after_m, diff_m, water] = await Promise.all([
    pointValue(r.before, x, y), pointValue(r.after, x, y), pointValue(r.diff, x, y), pointValue(r.water, x, y),
  ]);
  return { lon, lat, before_m, after_m, diff_m, water: water === 1 };
}

export async function diffWindow(minX: number, minY: number, maxX: number, maxY: number): Promise<{ diff: Grid; water: Grid | null } | null> {
  const [r, { readWindow }] = await Promise.all([rasters(), cogModule()]);
  const diff = await readWindow(r.diff, minX, minY, maxX, maxY);
  if (!diff) return null;
  // Read the water mask at the same resolution and window so cells line up one to one.
  const water = await readWindow(r.water, diff.originX, diff.originY - diff.height * diff.cell,
    diff.originX + diff.width * diff.cell, diff.originY, diff.width * diff.height);
  const aligned = water && water.width === diff.width && water.height === diff.height ? water : null;
  return { diff, water: aligned };
}
