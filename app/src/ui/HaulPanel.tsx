import { CYCLE_DEFAULTS, SOILS, TRUCKS } from '../content/haulDefaults';
import {
  balance, bankToLoose, cycleTime, effectiveLoad_m3, loadsNeeded, planDays, trucksForTarget, trucksToSaturateLoader,
} from '../math/haul';
import { formatArea, formatDistance, formatVolume, type UnitSystem } from '../math/units';
import {
  capacityOverride, dumpMin, efficiency, haul, haulScope, hoursPerDay, loadMin, nTrucks, payloadOverride,
  shrinkOverride, soilId, speedFactor, swellOverride, truckId, units, volume,
} from '../state';

const vol = (m3: number, u: UnitSystem) => { const f = formatVolume(m3, u); return `${f.value} ${f.unit}`; };
const num = (e: Event) => Number((e.target as HTMLInputElement).value);

export function HaulPanel() {
  const h = haul.value;
  const u = units.value;
  if (!h) return <p class="hint">The cleanup what-if needs haul.json from the pipeline (pipeline/haul_prep.py).</p>;

  // Scope: the SR 530 corridor preset, or whatever the user drew with the Measure tool.
  const drawn = volume.value;
  const scopeIsDrawn = haulScope.value === 'drawn' && !!drawn;
  const remove_bank = scopeIsDrawn ? drawn!.fill_m3 : h.corridor.volumes.fill_m3;
  const need_bank = scopeIsDrawn ? drawn!.cut_m3 : h.corridor.volumes.cut_m3;
  const scopeArea = scopeIsDrawn ? drawn!.polygon_area_m2 : h.corridor.volumes.corridor_area_m2;

  const soilBase = SOILS.find((s) => s.id === soilId.value) ?? SOILS[0];
  const soil = { ...soilBase, swell: swellOverride.value ?? soilBase.swell, shrink: shrinkOverride.value ?? soilBase.shrink };
  const truckBase = TRUCKS.find((t) => t.id === truckId.value) ?? TRUCKS[0];
  const truck = { ...truckBase, capacity_m3: capacityOverride.value ?? truckBase.capacity_m3, payload_t: payloadOverride.value ?? truckBase.payload_t };

  const b = balance(remove_bank, need_bank, soil.shrink);
  const surplusLoose = bankToLoose(b.surplus_bank_m3, soil.swell);
  const borrowLoose = bankToLoose(b.borrow_bank_m3, soil.swell);
  const load = effectiveLoad_m3(truck, soil);
  const loadsOut = loadsNeeded(surplusLoose, load);
  const loadsIn = loadsNeeded(borrowLoose, load);

  const rd = h.routes.disposal, rb = h.routes.borrow;
  const cycleOut = cycleTime({ haul_out_min: rd.out.duration_s / 60, haul_back_min: rd.back.duration_s / 60, load_min: loadMin.value, dump_min: dumpMin.value, speed_factor: speedFactor.value });
  // Borrow trucks run empty to the pit and loaded back, so the loaded leg is the return.
  const cycleIn = cycleTime({ haul_out_min: rb.back.duration_s / 60, haul_back_min: rb.out.duration_s / 60, load_min: loadMin.value, dump_min: dumpMin.value, speed_factor: speedFactor.value });

  const plan = planDays({
    legs: [{ loads: loadsOut, cycle_min: cycleOut }, { loads: loadsIn, cycle_min: cycleIn }],
    n_trucks: nTrucks.value, hours_per_day: hoursPerDay.value, efficiency: efficiency.value, load_min: loadMin.value,
  });
  const saturate = trucksToSaturateLoader(cycleOut, loadMin.value);
  const for30 = trucksForTarget(loadsOut + loadsIn, (loadsOut * cycleOut + loadsIn * cycleIn) / Math.max(1, loadsOut + loadsIn), hoursPerDay.value, 30, efficiency.value);
  const area = formatArea(scopeArea, u);
  const weightLimited = truck.payload_t / soil.loose_t_per_m3 < truck.capacity_m3;

  return (
    <div>
      <p class="banner">What-if, not history. This plans a cleanup of the SR 530 corridor back to its 2013 grade using the same mass-haul math a construction site runs. It is not what happened in 2014.</p>

      <h2>1. What to move</h2>
      <div class="seg" role="group" aria-label="Scope">
        <button type="button" aria-pressed={!scopeIsDrawn} onClick={() => (haulScope.value = 'corridor')}>SR 530 corridor</button>
        <button type="button" aria-pressed={scopeIsDrawn} onClick={() => (haulScope.value = 'drawn')} disabled={!drawn} title={drawn ? '' : 'Draw an area in the Measure tab first'}>Area I drew</button>
      </div>
      <p class="hint" style={{ marginTop: 8 }}>
        {scopeIsDrawn ? 'The shape you drew.' : `The highway, ${Math.round(h.corridor.half_width_m / 0.3048)} ft either side of its centerline, through the slide.`}{' '}
        {area.value} {area.unit}. Volumes are in bank measure (as the ground sits) above the level of detection; the lake surface is excluded.
      </p>
      <div class="stat-grid">
        <div class="stat"><div class="k"><span class="swatch fill" aria-hidden="true" />Debris to remove</div><div class="v">{formatVolume(remove_bank, u).value}<small>{formatVolume(remove_bank, u).unit}</small></div><div class="u">bank</div></div>
        <div class="stat"><div class="k"><span class="swatch cut" aria-hidden="true" />Ground to restore</div><div class="v">{formatVolume(need_bank, u).value}<small>{formatVolume(need_bank, u).unit}</small></div><div class="u">bank</div></div>
      </div>

      <h2>2. Material</h2>
      <label class="field">Soil type
        <select value={soilId.value} onChange={(e) => { soilId.value = (e.target as HTMLSelectElement).value; swellOverride.value = null; shrinkOverride.value = null; }}>
          {SOILS.map((s) => <option value={s.id} key={s.id}>{s.label}</option>)}
        </select>
      </label>
      <div class="fields">
        <label class="field">Swell (loose ÷ bank)<input type="number" step="0.01" min="1" max="2" value={soil.swell.toFixed(2)} onChange={(e) => (swellOverride.value = num(e))} /></label>
        <label class="field">Shrink (compacted ÷ bank)<input type="number" step="0.01" min="0.5" max="1.2" value={soil.shrink.toFixed(2)} onChange={(e) => (shrinkOverride.value = num(e))} /></label>
      </div>
      <p class="hint">In use: swell {soil.swell.toFixed(2)}, shrink {soil.shrink.toFixed(2)}, loose density {soil.loose_t_per_m3.toFixed(2)} t/m³. {soilBase.source}</p>

      <h2>3. Balance</h2>
      <ul>
        <li>Reused on site to restore lost ground: <b>{vol(b.reuse_bank_m3, u)}</b> bank (fills {vol(need_bank, u)} after compaction).</li>
        <li>Surplus hauled to disposal: <b>{vol(b.surplus_bank_m3, u)}</b> bank, which is <b>{vol(surplusLoose, u)}</b> loose in the trucks.</li>
        <li>Brought in from the borrow pit: <b>{vol(b.borrow_bank_m3, u)}</b> bank{b.borrow_bank_m3 > 0 ? `, ${vol(borrowLoose, u)} loose` : ''}.</li>
      </ul>

      <h2>4. Trucks</h2>
      <label class="field">Truck type
        <select value={truckId.value} onChange={(e) => { truckId.value = (e.target as HTMLSelectElement).value; capacityOverride.value = null; payloadOverride.value = null; loadMin.value = CYCLE_DEFAULTS.load_min[(e.target as HTMLSelectElement).value as 'adt' | 'highway'] ?? loadMin.value; }}>
          {TRUCKS.map((t) => <option value={t.id} key={t.id}>{t.label}</option>)}
        </select>
      </label>
      <div class="fields">
        <label class="field">Heaped capacity (m³)<input type="number" step="0.1" min="1" value={truck.capacity_m3} onChange={(e) => (capacityOverride.value = num(e))} /></label>
        <label class="field">Payload (t)<input type="number" step="0.5" min="1" value={truck.payload_t} onChange={(e) => (payloadOverride.value = num(e))} /></label>
      </div>
      <p class="hint">
        Each load carries {load.toFixed(1)} m³ loose ({formatVolume(load, u).value} {formatVolume(load, u).unit}), {weightLimited ? 'limited by payload weight' : 'a full heaped body'}.
        {' '}<b>{loadsOut.toLocaleString()}</b> loads out to disposal{loadsIn > 0 ? <>, <b>{loadsIn.toLocaleString()}</b> loads in from borrow</> : ''}. {truckBase.source}
      </p>

      <h2>5. Routes</h2>
      <ul>
        {h.sites.map((s) => {
          const r = h.routes[s.id];
          const d = formatDistance(r.out.distance_m, u);
          return (
            <li key={s.id}>
              <b>{s.role === 'disposal' ? 'Disposal' : 'Borrow'}:</b> {s.name}, permit {s.permit}, {s.commodity}. {d.value} {d.unit} and {Math.round(r.out.duration_s / 60)} min by car each way. <span class="muted">{s.why}.</span>
            </li>
          );
        })}
      </ul>
      <p class="hint">Sites from {h.sites_source.name}. Routes from {h.routing.engine}, fetched {h.routing.fetched}, drawn on the map.</p>

      <h2>6. Cycle and pace</h2>
      <div class="fields">
        <label class="field">Load (min)<input type="number" step="0.5" min="0.5" value={loadMin.value} onChange={(e) => (loadMin.value = num(e))} /></label>
        <label class="field">Dump (min)<input type="number" step="0.5" min="0" value={dumpMin.value} onChange={(e) => (dumpMin.value = num(e))} /></label>
        <label class="field">Loaded speed factor<input type="number" step="0.05" min="0.3" max="1" value={speedFactor.value} onChange={(e) => (speedFactor.value = num(e))} /></label>
        <label class="field">Trucks<input type="number" step="1" min="1" value={nTrucks.value} onChange={(e) => (nTrucks.value = Math.max(1, Math.round(num(e))))} /></label>
        <label class="field">Hours per day<input type="number" step="0.5" min="1" max="24" value={hoursPerDay.value} onChange={(e) => (hoursPerDay.value = num(e))} /></label>
        <label class="field">Efficiency<input type="number" step="0.01" min="0.3" max="1" value={efficiency.value} onChange={(e) => (efficiency.value = num(e))} /></label>
      </div>
      <div class="stat-grid">
        <div class="stat"><div class="k">Round trip to disposal</div><div class="v">{Math.round(cycleOut)}<small>min</small></div><div class="u">load, haul, dump, return</div></div>
        <div class="stat"><div class="k">Total loads</div><div class="v">{plan.loads.toLocaleString()}</div><div class="u">{Math.round(plan.loads_per_day)} per day at this pace</div></div>
        <div class="stat wide">
          <div class="k">Working days with {nTrucks.value} trucks</div>
          <div class="v">{plan.days < 1 ? plan.days.toFixed(1) : Math.ceil(plan.days).toLocaleString()}<small>days</small></div>
          <div class="u">{plan.loader_bound ? `the loader is the limit: ${saturate} trucks keep it busy, more will wait in line` : `${saturate} trucks would keep the loader busy; ${for30} trucks would finish in 30 days`}</div>
        </div>
      </div>
      <details>
        <summary>Assumptions in the cycle</summary>
        <ul>{CYCLE_DEFAULTS.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </details>
    </div>
  );
}
