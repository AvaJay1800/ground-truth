// Reference values for the what-if cleanup. Every number here is either read off a
// cited public source or marked as an assumption. All of them are editable in the panel.
import type { SoilFactors, Truck } from '../math/haul';

const CAT_TABLE = 'Caterpillar, "Material Density Tables to Help Estimate Earthwork Volumes" (cat.com, CI articles), loose and bank densities; swell = bank density / loose density';

// Swell comes straight from Caterpillar's loose and bank densities. Shrink (compacted volume
// per bank volume) is not on that page; the values below are conventional estimating
// defaults and are flagged as assumptions in the panel. Density is Caterpillar's loose figure.
export const SOILS: SoilFactors[] = [
  { id: 'earth_wet', label: 'Earth, wet excavated (mixed silt, sand, clay)', swell: 2020 / 1600, shrink: 0.90, loose_t_per_m3: 1.60,
    source: `${CAT_TABLE}: loose 1600 kg/m3, bank 2020 kg/m3. Shrink 0.90 assumed.` },
  { id: 'clay_bed', label: 'Clay, natural bed', swell: 2020 / 1660, shrink: 0.85, loose_t_per_m3: 1.66,
    source: `${CAT_TABLE}: loose 1660 kg/m3, bank 2020 kg/m3. Shrink 0.85 assumed.` },
  { id: 'clay_gravel_wet', label: 'Clay and gravel, wet', swell: 1840 / 1540, shrink: 0.90, loose_t_per_m3: 1.54,
    source: `${CAT_TABLE}: loose 1540 kg/m3, bank 1840 kg/m3. Shrink 0.90 assumed.` },
  { id: 'sand_gravel_wet', label: 'Sand and gravel, wet', swell: 2230 / 2020, shrink: 0.95, loose_t_per_m3: 2.02,
    source: `${CAT_TABLE}: loose 2020 kg/m3, bank 2230 kg/m3. Shrink 0.95 assumed.` },
  { id: 'gravel_pitrun', label: 'Gravel, pit run', swell: 2170 / 1930, shrink: 0.95, loose_t_per_m3: 1.93,
    source: `${CAT_TABLE}: loose 1930 kg/m3, bank 2170 kg/m3. Shrink 0.95 assumed.` },
];

export const TRUCKS: Truck[] = [
  {
    id: 'adt', label: 'Cat 745 articulated haul truck', capacity_m3: 26, payload_t: 41, speed_factor: 0.8,
    source: 'Caterpillar, Cat 745 Articulated Truck specifications (cat.com en_US product page): rated payload 41 t (45.2 tons), heaped capacity SAE 2:1 26 m3 (33.4 yd3). Speed factor 0.8 assumed: loaded off-highway trucks on a public road run slower than the car-based route time.',
  },
  {
    id: 'highway', label: 'Tri-axle highway dump truck, 16 ft body', capacity_m3: 12.2, payload_t: 16, speed_factor: 0.9,
    source: 'Body: Ox Bodies Stampede elliptical steel dump body, lengths 14 to 21 ft, capacities 13.6 to 28.9 yd3 (oxbodies.com product page); a 16 ft body with 54 in sides is taken as 16 yd3 (12.2 m3) heaped. Payload 16 t assumed: tri-axle dumps on Washington highways are limited by axle weights (RCW 46.44), typically 16 to 18 tons of payload. Speed factor 0.9 assumed.',
  },
];

// Cycle-time defaults, all assumptions, all editable.
export const CYCLE_DEFAULTS = {
  load_min: { adt: 5, highway: 2.5 },      // a 2 m3-class excavator at roughly 25 s a pass
  dump_min: 2,
  hours_per_day: 10,
  efficiency: 0.83,                        // the "50-minute hour" estimators use for production
  notes: [
    'Load time: a 2 m3-class excavator cycling about every 25 seconds, so 13 passes (5 min) for the 26 m3 truck and 6 passes (2.5 min) for the 16 yd3 body. Assumption.',
    'Dump and turnaround: 2 minutes. Assumption.',
    'Efficiency 0.83: a 50-minute productive hour, a common estimating convention. Assumption.',
    'Route times are car times from OpenStreetMap roads (OSRM). Loaded trucks are slowed by the speed factor; the empty return uses the car time.',
  ],
};
