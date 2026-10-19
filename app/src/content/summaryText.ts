// The plain-English summary at the top of the page. Pure templating over
// summary.json: every number comes from the pipeline, nothing is generated
// by a language model, and nothing runs server-side. Chosen over an API call
// because the numbers change only when the pipeline runs, and a template
// can be unit tested word for word.
import type { Summary } from '../state';
import { formatArea, formatLength, humanVolume, type UnitSystem } from '../math/units';

export interface SummaryText {
  headline: string;
  detail: string;
  caveat: string;
}

export function summaryText(s: Summary, u: UnitSystem): SummaryText {
  const cut = humanVolume(s.totals.cut_m3, u);
  const fill = humanVolume(s.totals.fill_m3, u);
  const restArea = formatArea(s.totals_over_1m.fill_area_m2, u);
  const deepest = formatLength(s.max_gain_m, u, 0);
  const scarp = formatLength(-s.max_loss_m, u, 0);
  const lake = formatArea(s.water.area_m2, u);
  const lod = formatLength(s.lod.lod_m, u, u === 'us' ? 1 : 2);

  const headline =
    `About ${cut} of hillside came down, and about ${fill} came to rest across ` +
    `${restArea.value} ${restArea.unit} of the valley. The debris is ${deepest.value} ${deepest.unit} deep at its thickest.`;

  const detail =
    `The scar on the hill is up to ${scarp.value} ${scarp.unit} lower than it was in 2013. ` +
    `The debris dammed the river, and a lake of ${lake.value} ${lake.unit} had formed by the time the plane flew two days later.`;

  const caveat =
    `Measured from two laser surveys of the bare ground, summer 2013 and March 24, 2014. ` +
    `Changes smaller than ${lod.value} ${lod.unit} are treated as no change. ` +
    `Cut and fill will not match exactly: loosened soil takes up more room, some debris is under the lake, and the river carried some away.`;

  return { headline, detail, caveat };
}
