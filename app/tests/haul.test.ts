import { describe, expect, it } from 'vitest';
import {
  balance, bankToCompacted, bankToLoose, cycleTime, daysNeeded, effectiveLoad_m3,
  loadsNeeded, loadsPerHour, planDays, trucksForTarget, trucksToSaturateLoader, type SoilFactors, type Truck,
} from '../src/math/haul';

const soil: SoilFactors = { id: 't', label: 'test', swell: 1.25, shrink: 0.9, loose_t_per_m3: 1.5, source: '' };
const adt: Truck = { id: 'adt', label: 'ADT', capacity_m3: 26, payload_t: 41, speed_factor: 0.8, source: '' };
const highway: Truck = { id: 'hw', label: 'highway', capacity_m3: 12.2, payload_t: 20, speed_factor: 0.85, source: '' };

describe('swell and shrink', () => {
  it('converts bank to loose and compacted', () => {
    expect(bankToLoose(1000, 1.25)).toBe(1250);
    expect(bankToCompacted(1000, 0.9)).toBe(900);
  });
});

describe('balance', () => {
  it('reuses what the holes can take, after compaction, and sends the rest away', () => {
    // 151,000 m3 of debris to remove, 6,400 m3 of lost ground to restore at 0.9 shrink.
    const b = balance(151_000, 6_400, 0.9);
    expect(b.reuse_bank_m3).toBeCloseTo(6_400 / 0.9, 6);
    expect(b.surplus_bank_m3).toBeCloseTo(151_000 - 6_400 / 0.9, 6);
    expect(b.borrow_bank_m3).toBe(0);
  });
  it('borrows when there is more hole than material', () => {
    const b = balance(100, 900, 0.9);
    expect(b.reuse_bank_m3).toBe(100);
    expect(b.surplus_bank_m3).toBe(0);
    expect(b.borrow_bank_m3).toBeCloseTo(1000 - 100, 6);
  });
});

describe('truck loads', () => {
  it('limits a load by volume or by payload, whichever bites first', () => {
    expect(effectiveLoad_m3(adt, soil)).toBe(26);          // 41 t / 1.5 = 27.3 m3 > 26 m3, so the body fills first
    expect(effectiveLoad_m3(highway, soil)).toBe(12.2);    // 20 t / 1.5 = 13.3 m3 > 12.2 m3, body fills first
    const heavy = { ...soil, loose_t_per_m3: 2.0 };
    expect(effectiveLoad_m3(highway, heavy)).toBeCloseTo(10); // 20 t / 2.0 = 10 m3 < 12.2, payload limits
  });
  it('rounds loads up', () => {
    expect(loadsNeeded(1000, 26)).toBe(39);
    expect(loadsNeeded(0, 26)).toBe(0);
  });
});

describe('cycle and fleet', () => {
  const cycle = cycleTime({ haul_out_min: 15, haul_back_min: 15, load_min: 5, dump_min: 2, speed_factor: 0.8 });
  it('adds load, slowed haul, dump and return', () => {
    expect(cycle).toBeCloseTo(5 + 18.75 + 2 + 15);
  });
  it('sizes the fleet to keep the loader busy', () => {
    expect(trucksToSaturateLoader(40.75, 5)).toBe(9);
    expect(trucksToSaturateLoader(4, 5)).toBe(1);
  });
  it('caps loads per hour at the loader', () => {
    expect(loadsPerHour(4, 40, 5)).toBeCloseTo(6);     // fleet-bound: 4 trucks x 1.5 cycles/h
    expect(loadsPerHour(40, 40, 5)).toBeCloseTo(12);   // loader-bound: 12 loads/h
  });
  it('plans days across legs, fleet-bound or loader-bound', () => {
    // 100 loads at 40 min and 20 loads at 50 min; 5 trucks, 10 h days, 50-minute hours.
    const fleet = planDays({ legs: [{ loads: 100, cycle_min: 40 }, { loads: 20, cycle_min: 50 }], n_trucks: 5, hours_per_day: 10, efficiency: 0.83, load_min: 5 });
    expect(fleet.loads).toBe(120);
    expect(fleet.truck_minutes).toBe(5000);
    expect(fleet.days).toBeCloseTo(5000 / (5 * 498));
    expect(fleet.loader_bound).toBe(false);
    // 60 trucks cannot beat the loader: 120 loads x 5 min = 600 min of loading.
    const loader = planDays({ legs: [{ loads: 120, cycle_min: 40 }], n_trucks: 60, hours_per_day: 10, efficiency: 0.83, load_min: 5 });
    expect(loader.loader_bound).toBe(true);
    expect(loader.days).toBeCloseTo(600 / 498);
    expect(planDays({ legs: [], n_trucks: 3, hours_per_day: 8, efficiency: 0.83, load_min: 5 }).days).toBe(0);
  });
  it('turns loads into days and back', () => {
    const days = daysNeeded(7260, 6, 10, 0.83);
    expect(days).toBeCloseTo(7260 / (6 * 10 * 0.83));
    expect(trucksForTarget(7260, 40, 10, 30, 0.83)).toBe(20);
    expect(daysNeeded(0, 6, 10)).toBe(0);
  });
});
