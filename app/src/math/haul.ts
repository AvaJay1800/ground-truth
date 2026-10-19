// Mass-haul math: balance, swell and shrink, truck loads, cycle time, fleet and days.
// Every function is pure and unit tested. Volumes in cubic meters, times in minutes.
//
// Vocabulary, in plain language:
//   bank      the volume of material as it sits in the ground (what the lidar measured)
//   loose     the same material after digging; it fluffs up (swell), which is what trucks carry
//   compacted the same material after placing and rolling; usually a bit smaller than bank (shrink)

export interface SoilFactors {
  id: string;
  label: string;
  /** Loose volume per bank volume, e.g. 1.25 means 25% swell. */
  swell: number;
  /** Compacted volume per bank volume, e.g. 0.90 means 10% shrink. */
  shrink: number;
  /** Loose density, tonnes per loose cubic meter, for checking the truck's payload limit. */
  loose_t_per_m3: number;
  source: string;
}

export interface Truck {
  id: string;
  label: string;
  /** Heaped body capacity, loose cubic meters. */
  capacity_m3: number;
  /** Rated payload, tonnes. */
  payload_t: number;
  /** Speed factor applied to car-based route durations: loaded trucks are slower. */
  speed_factor: number;
  source: string;
}

export interface Balance {
  /** Bank m³ of material to remove from the scope (debris, or cut). */
  remove_bank_m3: number;
  /** Bank m³ of material needed to restore lost ground (fill). */
  need_bank_m3: number;
  /** Bank m³ reused on site: the smaller of the two, limited by compaction. */
  reuse_bank_m3: number;
  /** Bank m³ that leaves the site for disposal. */
  surplus_bank_m3: number;
  /** Bank m³ that must be brought in from a borrow site. */
  borrow_bank_m3: number;
}

/**
 * Balance the scope. Material removed can fill the holes, but after compaction it
 * occupies `shrink` of its bank volume, so filling need_bank m³ of hole consumes
 * need_bank / shrink m³ of bank material.
 */
export function balance(remove_bank_m3: number, need_bank_m3: number, shrink: number): Balance {
  const bankToFillNeed = need_bank_m3 / shrink;
  const reuse = Math.min(remove_bank_m3, bankToFillNeed);
  return {
    remove_bank_m3,
    need_bank_m3,
    reuse_bank_m3: reuse,
    surplus_bank_m3: remove_bank_m3 - reuse,
    borrow_bank_m3: Math.max(0, bankToFillNeed - reuse),
  };
}

export const bankToLoose = (bank_m3: number, swell: number): number => bank_m3 * swell;
export const bankToCompacted = (bank_m3: number, shrink: number): number => bank_m3 * shrink;

/** Loose m³ a truck can actually carry: the heaped volume, unless the payload limit bites first. */
export function effectiveLoad_m3(truck: Truck, soil: SoilFactors): number {
  const byWeight = truck.payload_t / soil.loose_t_per_m3;
  return Math.min(truck.capacity_m3, byWeight);
}

export function loadsNeeded(loose_m3: number, load_m3: number): number {
  if (loose_m3 <= 0) return 0;
  return Math.ceil(loose_m3 / load_m3);
}

export interface CycleInputs {
  /** Car route durations from the precomputed routes, minutes. */
  haul_out_min: number;
  haul_back_min: number;
  /** Time to load one truck, minutes. */
  load_min: number;
  /** Time to dump and turn around, minutes. */
  dump_min: number;
  /** Loaded trucks are slower than cars: 0.8 means 25% longer on the road. */
  speed_factor: number;
}

/** Round-trip time for one truck, minutes. Empty return is assumed at car speed. */
export function cycleTime(c: CycleInputs): number {
  return c.load_min + c.haul_out_min / c.speed_factor + c.dump_min + c.haul_back_min;
}

/**
 * Trucks needed so the loader never waits: one truck per load interval within a cycle.
 * With a 5-minute load and a 40-minute cycle, eight trucks keep the loader busy.
 */
export function trucksToSaturateLoader(cycle_min: number, load_min: number): number {
  return Math.max(1, Math.ceil(cycle_min / load_min));
}

/** Loads per productive hour for a fleet of n trucks (capped by the loader). */
export function loadsPerHour(n_trucks: number, cycle_min: number, load_min: number): number {
  const fleet = n_trucks * (60 / cycle_min);
  const loader = 60 / load_min;
  return Math.min(fleet, loader);
}

/** Working days to move all loads at a given pace. */
export function daysNeeded(loads: number, loads_per_hour: number, hours_per_day: number, efficiency = 0.83): number {
  if (loads <= 0) return 0;
  return loads / (loads_per_hour * hours_per_day * efficiency);
}

export interface HaulLeg {
  loads: number;
  cycle_min: number;
}

export interface PlanInputs {
  legs: HaulLeg[];          // e.g. debris to disposal, fill from borrow
  n_trucks: number;
  hours_per_day: number;
  efficiency: number;       // 0.83 = a 50-minute hour
  load_min: number;         // loader cap: one load per load_min
}

export interface PlanResult {
  loads: number;
  truck_minutes: number;    // total on-road and loading time across the fleet
  days: number;             // working days, fleet- or loader-bound, whichever is longer
  loader_bound: boolean;    // true when adding trucks would not help
  loads_per_day: number;
}

/** Working days for a fleet to finish every leg, honoring the loader's maximum pace. */
export function planDays(p: PlanInputs): PlanResult {
  const loads = p.legs.reduce((s, l) => s + l.loads, 0);
  const truckMinutes = p.legs.reduce((s, l) => s + l.loads * l.cycle_min, 0);
  const productiveMinPerDay = p.hours_per_day * 60 * p.efficiency;
  if (loads === 0 || p.n_trucks <= 0 || productiveMinPerDay <= 0) {
    return { loads, truck_minutes: truckMinutes, days: 0, loader_bound: false, loads_per_day: 0 };
  }
  const fleetDays = truckMinutes / (p.n_trucks * productiveMinPerDay);
  const loaderDays = (loads * p.load_min) / productiveMinPerDay;
  const days = Math.max(fleetDays, loaderDays);
  return { loads, truck_minutes: truckMinutes, days, loader_bound: loaderDays >= fleetDays, loads_per_day: loads / days };
}

/** Trucks needed to finish in a target number of days (rounded up), ignoring the loader cap. */
export function trucksForTarget(loads: number, cycle_min: number, hours_per_day: number, target_days: number, efficiency = 0.83): number {
  if (loads <= 0) return 0;
  const loadsPerTruckPerDay = (60 / cycle_min) * hours_per_day * efficiency;
  return Math.ceil(loads / (loadsPerTruckPerDay * target_days));
}
