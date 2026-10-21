import { CYCLE_DEFAULTS, SOILS, TRUCKS } from '../content/haulDefaults';
import { haulModel } from '../model/haulModel';
import { formatArea, formatDistance, formatVolume, humanVolume, type UnitSystem } from '../math/units';
import {
  capacityOverride, dumpMin, efficiency, haul, haulScope, hoursPerDay, loadMin, nTrucks, panel, payloadOverride,
  shrinkOverride, soilId, speedFactor, swellOverride, truckId, units, volume,
} from '../state';
import { Fold } from './Fold';

const vol = (m3: number, u: UnitSystem) => { const f = formatVolume(m3, u); return `${f.value} ${f.unit}`; };
const num = (e: Event) => Number((e.target as HTMLInputElement).value);

/** The cleanup what-if: three numbers on top, every factor one fold down. */
export function HaulPanel() {
  const h = haul.value;
  const u = units.value;
  const m = haulModel();
  if (!h || !m) return <p class="hint">The cleanup what-if needs haul.json from the pipeline (pipeline/haul_prep.py).</p>;
  const drawn = volume.value;
  const area = formatArea(m.scopeArea_m2, u);
  const { soil, soilBase, truck, truckBase, balance: b, plan } = m;
  const days = plan.days < 1 ? plan.days.toFixed(1) : Math.ceil(plan.days).toLocaleString();

  return (
    <div>
      <p class="banner">What-if, not history. This plans a cleanup of the SR 530 corridor back to its 2013 grade with the same mass-haul math a construction site runs. It is not what happened in 2014.</p>

      <div class="stat-grid">
        <div class="stat"><div class="k"><span class="swatch fill" aria-hidden="true" />Debris to remove</div><div class="v">{formatVolume(m.remove_bank, u).value}<small>{formatVolume(m.remove_bank, u).unit}</small></div><div class="u">bank, {m.scopeIsDrawn ? 'the area you drew' : 'the highway corridor'}</div></div>
        <div class="stat"><div class="k">Truckloads</div><div class="v">{plan.loads.toLocaleString()}</div><div class="u">{truckBase.label.split(' ').slice(0, 2).join(' ')}, {m.load_m3.toFixed(0)} m³ each</div></div>
        <div class="stat wide">
          <div class="k">Working days with {nTrucks.value} trucks, {hoursPerDay.value} h a day</div>
          <div class="v">{days}<small>days</small></div>
          <div class="u">{Math.round(m.cycleOut_min)} min round trip to the pit · {plan.loader_bound ? `the loader is the limit at ${m.saturate} trucks` : `${m.trucksFor30Days} trucks would finish in 30 days`}</div>
        </div>
      </div>
      <p>
        About {humanVolume(m.remove_bank, u)} of debris sits on the corridor. {vol(b.reuse_bank_m3, u)} of it can refill the ground that was lost;
        the rest, {humanVolume(b.surplus_bank_m3, u)}, goes to a pit {formatDistance(h.routes.disposal.out.distance_m, u).value} {formatDistance(h.routes.disposal.out.distance_m, u).unit} away.
        {' '}<button type="button" class="link" onClick={() => (panel.value = 'schedule')}>Put it on a calendar</button>
      </p>
      <p class="hint">Change any factor below. Each fold shows what is in use and where the default came from.</p>

      <Fold title="What to move" current={m.scopeIsDrawn ? `the area you drew, ${area.value} ${area.unit}` : `SR 530 corridor, ${area.value} ${area.unit}`}>
        <div class="seg" role="group" aria-label="Scope">
          <button type="button" aria-pressed={!m.scopeIsDrawn} onClick={() => (haulScope.value = 'corridor')}>SR 530 corridor</button>
          <button type="button" aria-pressed={m.scopeIsDrawn} onClick={() => (haulScope.value = 'drawn')} disabled={!drawn} title={drawn ? '' : 'Draw an area with the map tool first'}>Area I drew</button>
        </div>
        <p class="hint" style={{ marginTop: 8 }}>
          {m.scopeIsDrawn ? 'The shape you drew.' : `The highway, ${Math.round(h.corridor.half_width_m / 0.3048)} ft either side of its centerline, through the slide.`}{' '}
          Volumes are in bank measure (as the ground sits) above the level of detection; the lake surface is excluded.
        </p>
        <ul>
          <li>Debris to remove: <b>{vol(m.remove_bank, u)}</b> bank.</li>
          <li>Ground lost, to restore: <b>{vol(m.need_bank, u)}</b> bank.</li>
        </ul>
      </Fold>

      <Fold title="Material" current={`${soilBase.label.split(' (')[0]}, swell ${soil.swell.toFixed(2)}, shrink ${soil.shrink.toFixed(2)}`}>
        <label class="field">Soil type
          <select value={soilId.value} onChange={(e) => { soilId.value = (e.target as HTMLSelectElement).value; swellOverride.value = null; shrinkOverride.value = null; }}>
            {SOILS.map((s) => <option value={s.id} key={s.id}>{s.label}</option>)}
          </select>
        </label>
        <div class="fields">
          <label class="field">Swell (loose ÷ bank)<input type="number" step="0.01" min="1" max="2" value={soil.swell.toFixed(2)} onChange={(e) => (swellOverride.value = num(e))} /></label>
          <label class="field">Shrink (compacted ÷ bank)<input type="number" step="0.01" min="0.5" max="1.2" value={soil.shrink.toFixed(2)} onChange={(e) => (shrinkOverride.value = num(e))} /></label>
        </div>
        <p class="hint">Loose density {soil.loose_t_per_m3.toFixed(2)} t/m³. {soilBase.source}</p>
      </Fold>

      <Fold title="Balance" current={`reuse ${vol(b.reuse_bank_m3, u)}, haul out ${vol(b.surplus_bank_m3, u)}${b.borrow_bank_m3 > 0 ? `, bring in ${vol(b.borrow_bank_m3, u)}` : ''}`}>
        <ul>
          <li>Reused on site to restore lost ground: <b>{vol(b.reuse_bank_m3, u)}</b> bank (fills {vol(m.need_bank, u)} after compaction).</li>
          <li>Surplus hauled to disposal: <b>{vol(b.surplus_bank_m3, u)}</b> bank, which is <b>{vol(m.surplusLoose, u)}</b> loose in the trucks.</li>
          <li>Brought in from the borrow pit: <b>{vol(b.borrow_bank_m3, u)}</b> bank{b.borrow_bank_m3 > 0 ? `, ${vol(m.borrowLoose, u)} loose` : ''}.</li>
        </ul>
        <p class="hint">Reuse comes first: what is dug out fills the holes, after compaction. Only the surplus leaves the site, and only a deficit is bought in.</p>
      </Fold>

      <Fold title="Trucks" current={`${truckBase.label}, ${m.load_m3.toFixed(1)} m³ a load`}>
        <label class="field">Truck type
          <select value={truckId.value} onChange={(e) => { const id = (e.target as HTMLSelectElement).value; truckId.value = id; capacityOverride.value = null; payloadOverride.value = null; loadMin.value = CYCLE_DEFAULTS.load_min[id as 'adt' | 'highway'] ?? loadMin.value; }}>
            {TRUCKS.map((t) => <option value={t.id} key={t.id}>{t.label}</option>)}
          </select>
        </label>
        <div class="fields">
          <label class="field">Heaped capacity (m³)<input type="number" step="0.1" min="1" value={truck.capacity_m3} onChange={(e) => (capacityOverride.value = num(e))} /></label>
          <label class="field">Payload (t)<input type="number" step="0.5" min="1" value={truck.payload_t} onChange={(e) => (payloadOverride.value = num(e))} /></label>
        </div>
        <p class="hint">
          Each load carries {m.load_m3.toFixed(1)} m³ loose ({formatVolume(m.load_m3, u).value} {formatVolume(m.load_m3, u).unit}), {m.weightLimited ? 'limited by payload weight' : 'a full heaped body'}.
          {' '}<b>{m.loadsOut.toLocaleString()}</b> loads out to disposal{m.loadsIn > 0 ? <>, <b>{m.loadsIn.toLocaleString()}</b> loads in from borrow</> : ''}. {truckBase.source}
        </p>
      </Fold>

      <Fold title="Routes" current={`${formatDistance(h.routes.disposal.out.distance_m, u).value} ${formatDistance(h.routes.disposal.out.distance_m, u).unit} to disposal, ${Math.round(h.routes.disposal.out.duration_s / 60)} min by car`}>
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
      </Fold>

      <Fold title="Cycle and pace" current={`${nTrucks.value} trucks, ${hoursPerDay.value} h days, ${Math.round(m.cycleOut_min)} min round trip`}>
        <div class="fields">
          <label class="field">Load (min)<input type="number" step="0.5" min="0.5" value={loadMin.value} onChange={(e) => (loadMin.value = num(e))} /></label>
          <label class="field">Dump (min)<input type="number" step="0.5" min="0" value={dumpMin.value} onChange={(e) => (dumpMin.value = num(e))} /></label>
          <label class="field">Loaded speed factor<input type="number" step="0.05" min="0.3" max="1" value={speedFactor.value} onChange={(e) => (speedFactor.value = num(e))} /></label>
          <label class="field">Trucks<input type="number" step="1" min="1" value={nTrucks.value} onChange={(e) => (nTrucks.value = Math.max(1, Math.round(num(e))))} /></label>
          <label class="field">Hours per day<input type="number" step="0.5" min="1" max="24" value={hoursPerDay.value} onChange={(e) => (hoursPerDay.value = num(e))} /></label>
          <label class="field">Efficiency<input type="number" step="0.01" min="0.3" max="1" value={efficiency.value} onChange={(e) => (efficiency.value = num(e))} /></label>
        </div>
        <p class="hint">
          Round trip: load, haul (slowed by the speed factor), dump, return at car speed. {Math.round(plan.loads_per_day)} loads a day at this pace.
          {' '}{plan.loader_bound ? `The loader is the limit: ${m.saturate} trucks keep it busy, more wait in line.` : `${m.saturate} trucks would keep the loader busy.`}
        </p>
        <ul>{CYCLE_DEFAULTS.notes.map((n) => <li key={n} class="muted">{n}</li>)}</ul>
      </Fold>
    </div>
  );
}
