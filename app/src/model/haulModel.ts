// One place that turns the user's haul choices into numbers, shared by the
// cleanup panel and the schedule. All the math lives in src/math; this is glue.
import { CYCLE_DEFAULTS, SOILS, TRUCKS } from '../content/haulDefaults';
import {
  balance, bankToLoose, cycleTime, effectiveLoad_m3, loadsNeeded, loadsPerHour, planDays,
  trucksForTarget, trucksToSaturateLoader, type Balance, type PlanResult, type SoilFactors, type Truck,
} from '../math/haul';
import {
  capacityOverride, dumpMin, efficiency, haul, haulScope, hoursPerDay, loadMin, nTrucks, payloadOverride,
  shrinkOverride, soilId, speedFactor, swellOverride, truckId, volume,
} from '../state';

export interface HaulModel {
  scopeIsDrawn: boolean;
  scopeArea_m2: number;
  remove_bank: number;
  need_bank: number;
  soil: SoilFactors;
  soilBase: SoilFactors;
  truck: Truck;
  truckBase: Truck;
  balance: Balance;
  surplusLoose: number;
  borrowLoose: number;
  load_m3: number;
  weightLimited: boolean;
  loadsOut: number;
  loadsIn: number;
  cycleOut_min: number;
  cycleIn_min: number;
  plan: PlanResult;
  saturate: number;
  trucksFor30Days: number;
  /** Bank m³ the fleet moves per productive hour, loader- or fleet-bound. */
  bank_m3_per_hour: number;
  /** Bank m³ that goes on a truck (surplus out plus borrow in). */
  trucked_bank_m3: number;
}

export function haulModel(): HaulModel | null {
  const h = haul.value;
  if (!h) return null;
  const drawn = volume.value;
  const scopeIsDrawn = haulScope.value === 'drawn' && !!drawn;
  const remove_bank = scopeIsDrawn ? drawn!.fill_m3 : h.corridor.volumes.fill_m3;
  const need_bank = scopeIsDrawn ? drawn!.cut_m3 : h.corridor.volumes.cut_m3;
  const scopeArea_m2 = scopeIsDrawn ? drawn!.polygon_area_m2 : h.corridor.volumes.corridor_area_m2;

  const soilBase = SOILS.find((s) => s.id === soilId.value) ?? SOILS[0];
  const soil = { ...soilBase, swell: swellOverride.value ?? soilBase.swell, shrink: shrinkOverride.value ?? soilBase.shrink };
  const truckBase = TRUCKS.find((t) => t.id === truckId.value) ?? TRUCKS[0];
  const truck = { ...truckBase, capacity_m3: capacityOverride.value ?? truckBase.capacity_m3, payload_t: payloadOverride.value ?? truckBase.payload_t };

  const b = balance(remove_bank, need_bank, soil.shrink);
  const surplusLoose = bankToLoose(b.surplus_bank_m3, soil.swell);
  const borrowLoose = bankToLoose(b.borrow_bank_m3, soil.swell);
  const load_m3 = effectiveLoad_m3(truck, soil);
  const loadsOut = loadsNeeded(surplusLoose, load_m3);
  const loadsIn = loadsNeeded(borrowLoose, load_m3);

  const rd = h.routes.disposal, rb = h.routes.borrow;
  const cycleOut_min = cycleTime({ haul_out_min: rd.out.duration_s / 60, haul_back_min: rd.back.duration_s / 60, load_min: loadMin.value, dump_min: dumpMin.value, speed_factor: speedFactor.value });
  const cycleIn_min = cycleTime({ haul_out_min: rb.back.duration_s / 60, haul_back_min: rb.out.duration_s / 60, load_min: loadMin.value, dump_min: dumpMin.value, speed_factor: speedFactor.value });

  const plan = planDays({
    legs: [{ loads: loadsOut, cycle_min: cycleOut_min }, { loads: loadsIn, cycle_min: cycleIn_min }],
    n_trucks: nTrucks.value, hours_per_day: hoursPerDay.value, efficiency: efficiency.value, load_min: loadMin.value,
  });
  const totalLoads = loadsOut + loadsIn;
  const meanCycle = totalLoads ? (loadsOut * cycleOut_min + loadsIn * cycleIn_min) / totalLoads : cycleOut_min;
  const lph = loadsPerHour(nTrucks.value, meanCycle, loadMin.value);

  return {
    scopeIsDrawn, scopeArea_m2, remove_bank, need_bank, soil, soilBase, truck, truckBase,
    balance: b, surplusLoose, borrowLoose, load_m3,
    weightLimited: truck.payload_t / soil.loose_t_per_m3 < truck.capacity_m3,
    loadsOut, loadsIn, cycleOut_min, cycleIn_min, plan,
    saturate: trucksToSaturateLoader(cycleOut_min, loadMin.value),
    trucksFor30Days: trucksForTarget(totalLoads, meanCycle, hoursPerDay.value, 30, efficiency.value),
    bank_m3_per_hour: (lph * load_m3) / soil.swell,
    trucked_bank_m3: b.surplus_bank_m3 + b.borrow_bank_m3,
  };
}

export const DEFAULT_LOAD_MIN = CYCLE_DEFAULTS.load_min;
