// Where the pipeline outputs live. In dev, vite.config.ts serves ../data/derived at /data.
// In production VITE_DATA_BASE points at the Cloudflare R2 bucket.
export const DATA_BASE: string = (import.meta.env.VITE_DATA_BASE as string | undefined) ?? '/data';

export const DATA = {
  summary: `${DATA_BASE}/summary.json`,
  legend: `${DATA_BASE}/legend.json`,
  before: `${DATA_BASE}/before_m.tif`,
  after: `${DATA_BASE}/after_m.tif`,
  diff: `${DATA_BASE}/diff_m.tif`,
  water: `${DATA_BASE}/water_mask.tif`,
  haul: `${DATA_BASE}/haul.json`,
  tiles: (set: 'before' | 'after' | 'change') => `${DATA_BASE}/tiles/${set}/{z}/{x}/{y}.png`,
};

// Basemaps. Both are free, need no key, and carry their own attribution.
export const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
export const IMAGERY_TILES = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
export const IMAGERY_ATTRIBUTION = 'Imagery: USGS The National Map (current, after the cleanup)';

export const INITIAL_VIEW = { center: [-121.845, 48.281] as [number, number], zoom: 13.6 };

// Oso, Washington. SR 530 runs east to west through the valley.
export const SITE = {
  name: 'Oso, Washington',
  eventDate: 'March 22, 2014',
  memorialSource: {
    label: 'Geotechnical Extreme Events Reconnaissance report on the slide (Snohomish County)',
    url: 'https://snohomishcountywa.gov/DocumentCenter/View/18180/GEER_Oso_Landslide_Report_July2014',
  },
};
