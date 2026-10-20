import { itemsFor, catalogById, planSectors, plantsLabel, waitLabel, SECTOR_SHORT } from '@/data/catalog';
import type {
  Allocation, CatalogItem, CostLine, Experience, PlanInput, PlanResult, PlanZone, ScheduleItem, Sector,
} from '@/types';
import { clamp, peso, sum } from '@/lib/format';
import { buildLayout, measuredAreas, planPlot, plotDims, zoneCapacity, type AllocTarget, type Plot, type Zone } from './layout';
import { drainagePlan, electricalPlan, waterPlan, type Part } from './infra';

export { cropGrid, plotDims } from './layout';

/**
 * The planner. One or more types (vegetables & crops, fruits, fish, livestock) share one plot and one budget:
 *   - the land is split evenly between the types (layout.ts draws one strip per type);
 *   - each type gets the user's own picks for that type, or the best suggestions for its share of the land;
 *   - the planted area of every type shrinks by the same factor until the whole start-up cost fits the capital;
 *   - the water tank and pump, drainage canal, wiring and permit allowance are shared and counted once.
 * A single-type plan is the same thing with one strip, so it comes out exactly as before mixes existed.
 */

const EXP_LEVEL: Record<Experience, number> = { beginner: 1, intermediate: 2, advanced: 3 };
const GRID_KWH_PESO = 13;
const WATER_PESO_PER_M3 = 40;

/** Economy-of-scale on set-up cost per sqm (small plots cost more per sqm, large ones less). */
export function scaleFactor(areaSqm: number): number {
  if (areaSqm <= 50) return 1.15;
  if (areaSqm <= 500) return 1;
  if (areaSqm <= 5000) return 0.8;
  return 0.6;
}

export interface Economics {
  incomeMo: number;
  opMo: number;
  profitMo: number;
  initialPerSqm: number;
}

export function economics(item: CatalogItem, areaSqm: number): Economics {
  const cycleMonths = item.cycleDays / 30;
  const incomeMo = (item.yieldKgPerSqm * item.farmGatePerKg) / cycleMonths;
  const opMo = item.opCostPerSqmMonth;
  const wcMonths = clamp(cycleMonths, 1, 3);
  return {
    incomeMo,
    opMo,
    profitMo: incomeMo - opMo,
    initialPerSqm: item.startupCostPerSqm * scaleFactor(areaSqm) + opMo * wcMonths,
  };
}

const HARD_SUNLIGHT = new Set(['Fruiting vegetable', 'Field crop']);

/** Smallest sensible block for an item in this part of the plot (a single bed for small crop plots). */
function effectiveMin(item: CatalogItem, cap: number, bedMode: boolean, bedArea: number): number {
  if (bedMode) return bedArea;
  return Math.min(item.minAreaSqm, cap * 0.5);
}

interface Candidate { item: CatalogItem; score: number }

type Unsuitable = { code: 'difficulty' | 'area' | 'brackish' | 'fresh' | 'scale' | 'cool' | 'shade'; text: string };

/** Why an item does not suit this site (null when it does); `text` reads after "<item> ...". Used to filter suggestions and to warn about the user's own picks. */
function unsuitable(input: PlanInput, sector: Sector, i: CatalogItem, cap: number, bedMode: boolean, bedArea: number, maxDiff: number, relaxArea: boolean): Unsuitable | null {
  if (i.difficulty > maxDiff) return { code: 'difficulty', text: `is rated harder than your experience level. Get hands-on guidance from your municipal agriculture/fisheries office first.` };
  const min = bedMode ? bedArea : i.minAreaSqm;
  if (!relaxArea && min > cap) return { code: 'area', text: `usually needs at least ${Math.round(min)} sqm, more than this space has. Treat it as a small trial.` };
  if (i.needsBrackish && !input.site.brackishWater) return { code: 'brackish', text: `needs brackish (salty) water and your site is set to fresh water.` };
  if (i.freshOnly && input.site.brackishWater) return { code: 'fresh', text: `needs fresh water and your site is set to brackish water.` };
  if (!bedMode && sector === 'crops' && i.category === 'Leafy vegetable') return { code: 'scale', text: `is hard to sell at this farm size: leafy greens spoil fast in large volumes. Plan your buyers first.` }; // not marketable at hectare scale
  if (i.prefersCool && !input.site.cool && input.experience !== 'advanced') return { code: 'cool', text: '' }; // the general "prefers cool" warning covers it
  if (input.site.sunlight === 'shaded' && sector === 'crops' && HARD_SUNLIGHT.has(i.category)) return { code: 'shade', text: `needs more sun than your site gets.` };
  if (input.site.sunlight === 'shaded' && sector === 'fruits' && !i.shadeTolerant) return { code: 'shade', text: `needs more sun than your site gets to bear fruit well.` };
  return null;
}

/** The user's own picks of this type, in the order they were picked. */
function pickedItems(input: PlanInput, sector: Sector): CatalogItem[] {
  const ids = new Set(itemsFor(sector).map((i) => i.id));
  return (input.preferred ?? []).filter((id, k, a) => ids.has(id) && a.indexOf(id) === k).map((id) => catalogById(id)!).filter(Boolean);
}

function scoreItem(input: PlanInput, sector: Sector, item: CatalogItem, cap: number, bedMode: boolean): number {
  const e = economics(item, cap);
  let score = e.profitMo > 0 ? e.profitMo / Math.sqrt(e.initialPerSqm) : 0.01;
  if (item.difficulty === 1) score *= input.goal === 'commercial' ? 1 : 1.2;
  if (item.difficulty === 3) score *= 0.75;
  if (item.prefersCool && !input.site.cool) score *= 0.5;
  if (sector === 'crops' && !bedMode) {
    // hectare-scale farms: field crops and fruiting vegetables suit the scale better than leafy micro-crops
    if (item.category === 'Field crop') score *= 2.5;
    else if (item.category === 'Leafy vegetable') score *= 0.4;
  }
  if (sector === 'crops' && input.site.sunlight === 'partial' && HARD_SUNLIGHT.has(item.category)) score *= 0.8;
  if (sector === 'fruits' && input.site.sunlight === 'partial' && !item.shadeTolerant) score *= 0.8;
  // trees that take years to bear earn nothing in the meantime
  if (item.daysToHarvest > 365) score *= 365 / item.daysToHarvest;
  return score;
}

function rankCandidates(input: PlanInput, sector: Sector, cap: number, bedMode: boolean, bedArea: number, warnings: string[], mixed: boolean): Candidate[] {
  const lvl = EXP_LEVEL[input.experience];
  const kind = mixed ? `${SECTOR_SHORT[sector].toLowerCase()} ` : '';

  // The user picked what to grow: use exactly those, and say plainly when one does not suit the site.
  const picked = pickedItems(input, sector);
  if (picked.length) {
    for (const i of picked) {
      const why = i.custom ? null : unsuitable(input, sector, i, cap, bedMode, bedArea, lvl, false);
      if (why?.text) warnings.push(`You picked ${i.name}, but it ${why.text}`);
    }
    return picked.map((item) => ({ item, score: scoreItem(input, sector, item, cap, bedMode) }));
  }

  const pool = (maxDiff: number, relaxArea: boolean) =>
    itemsFor(sector).filter((i) => !unsuitable(input, sector, i, cap, bedMode, bedArea, maxDiff, relaxArea));

  let items = pool(lvl, false);
  if (items.length === 0) {
    items = pool(Math.min(3, lvl + 1), false);
    if (items.length > 0) warnings.push(`No beginner-level ${kind}option fits this size, so the plan includes a harder option. Get hands-on guidance from your municipal agriculture/fisheries office first.`);
  }
  if (items.length === 0) {
    items = pool(3, true);
    if (items.length > 0) warnings.push(mixed
      ? `The land for ${SECTOR_SHORT[sector].toLowerCase()} is smaller than usually recommended for those options. Treat that part as a pilot and expect lower efficiency.`
      : 'This area is smaller than usually recommended for the options in this category. Treat the plan as a pilot and expect lower efficiency.');
  }

  return items.map((item) => ({ item, score: scoreItem(input, sector, item, cap, bedMode) })).sort((a, b) => b.score - a.score);
}

function chooseCount(sector: Sector, cap: number, bedMode: boolean, slots: number): number {
  if (sector === 'crops') {
    if (bedMode) return clamp(slots >= 8 ? 4 : slots, 1, 4);
    return cap >= 2000 ? 3 : 2;
  }
  if (sector === 'fruits') return cap < 40 ? 1 : cap < 400 ? 2 : 3;
  if (sector === 'fish') return cap < 300 ? 1 : 2;
  return cap >= 60 ? 2 : 1;
}

const NOUN: Record<Sector, string> = { crops: 'Vegetable', fruits: 'Fruit', fish: 'Fish', livestock: 'Livestock' };

function titleFor(input: PlanInput, sectors: Sector[]): string {
  if (input.name.trim()) return input.name.trim();
  const a = input.areaSqm;
  if (sectors.length > 1) {
    const size = a <= 200 ? 'Backyard' : a <= 5000 ? 'Small' : 'Large';
    return sectors.length === 2 ? `${size} ${NOUN[sectors[0]]} & ${NOUN[sectors[1]]} Farm` : `${size} Mixed Farm`;
  }
  const sector = sectors[0];
  if (sector === 'crops') return a <= 100 ? 'Backyard Vegetable Garden' : a <= 2000 ? 'Small Vegetable Farm' : 'Field Crop Farm';
  if (sector === 'fruits') return a <= 200 ? 'Backyard Fruit Garden' : a <= 5000 ? 'Fruit Orchard' : 'Fruit Plantation';
  if (sector === 'fish') return a <= 100 ? 'Backyard Fish Tanks' : a <= 3000 ? 'Fishpond Project' : 'Aquaculture Farm';
  return a <= 60 ? 'Backyard Livestock Project' : 'Livestock Farm';
}

/** One type's part, ready to be sized: its strip of the plot, what goes in it and in what proportions. */
interface ZonePlan {
  zone: Zone;
  cap: number;
  bedArea: number;
  chosen: Candidate[];
  shares: number[];
  userPicked: boolean;
}

interface Attempt {
  /** what each part ends up with, measured from the drawing (same order as the zones) */
  parts: Part[];
  result: Omit<PlanResult, 'title' | 'summary' | 'warnings' | 'assumptions' | 'schedule' | 'phased'>;
}

/** Split `total` sqm by share, but never above an item's realistic market-absorption cap. */
function allocateWithCaps(chosen: Candidate[], shares: number[], total: number): number[] {
  const caps = chosen.map((c) => c.item.maxAreaSqm ?? Infinity);
  const out = shares.map((sh, i) => Math.min(total * sh, caps[i]));
  for (let pass = 0; pass < 4; pass++) {
    const left = total - sum(out);
    if (left < 0.01) break;
    const room = out.map((o, i) => Math.max(0, caps[i] - o));
    const roomTotal = sum(room);
    if (roomTotal < 0.01) break;
    out.forEach((o, i) => { out[i] = o + Math.min(room[i], (left * room[i]) / roomTotal); });
  }
  return out;
}

/** What each item of one part gets at planting fraction `f` (empty when the part becomes too small to lay out). */
function zoneTargets(z: ZonePlan, f: number): AllocTarget[] {
  const { zone, chosen, shares } = z;
  if (zone.grid) {
    // small plots: allocate whole beds (largest-remainder), at least one bed per crop
    const g = zone.grid;
    const usable = Math.max(1, Math.round(g.slots.length * f));
    const items = chosen.slice(0, Math.min(chosen.length, usable));
    const shTotal = sum(shares.slice(0, items.length));
    const exact = items.map((_, i) => (shares[i] / shTotal) * usable);
    const beds = exact.map((e) => Math.max(1, Math.floor(e)));
    let rem = usable - sum(beds);
    const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac);
    for (let k = 0; rem > 0 && order.length; k = (k + 1) % order.length, rem--) beds[order[k].i]++;
    while (rem < 0) {
      const big = beds.indexOf(Math.max(...beds));
      if (beds[big] <= 1) break;
      beds[big]--;
      rem++;
    }
    return items.map((c, i) => ({ item: c.item, areaSqm: beds[i] * g.bedW * g.bedLen }));
  }
  const areas = allocateWithCaps(chosen, shares, z.cap * f);
  return chosen
    .map((c, i) => ({ item: c.item, areaSqm: areas[i] }))
    .filter((t) => t.areaSqm >= effectiveMin(t.item, z.cap, false, z.bedArea) * Math.min(1, f + 0.15));
}

const PRODUCTION_LABEL: Record<Sector, string> = {
  crops: 'Seeds, compost, trellis & bed preparation',
  fruits: 'Seedlings, planting holes, compost & stakes',
  fish: 'Pond/tank construction & fingerlings set-up',
  livestock: 'Housing, fencing & starter stock set-up',
};
const PIPE_COST: Record<Sector, (used: number) => number> = {
  crops: (u) => u * 25,
  fruits: (u) => 300 + u * 8, // hose or drip line to each tree basin
  fish: (u) => 600 + u * 4,
  livestock: (u) => 500 + u * 10,
};
const TOOLS_COST: Record<Sector, (used: number) => number> = {
  crops: (u) => (u < 10 ? 300 : 800 + u * 0.5),
  fruits: (u) => (u < 50 ? 600 : 1500 + u * 0.2), // pruning shears, sprayer, ladder or picking pole
  fish: () => 1200,
  livestock: () => 1000,
};

function buildAttempt(input: PlanInput, plot: Plot, zones: ZonePlan[], f: number): Attempt | null {
  const targets: AllocTarget[][] = [];
  for (const z of zones) {
    const t = zoneTargets(z, f);
    if (t.length === 0) return null; // every chosen type must keep a sensible part
    targets.push(t);
  }

  const placeholder = buildLayout(plot, targets, { tank: true, pump: false, power: false });
  const measured = measuredAreas(placeholder);
  const actual = targets.map((t) => t.map((x) => ({ item: x.item, areaSqm: measured.get(x.item.id) ?? 0 })).filter((x) => x.areaSqm > 0));
  if (actual.some((a) => a.length === 0)) return null;
  const all = actual.flat();
  const used = sum(all.map((a) => a.areaSqm));
  const parts: Part[] = zones.map((z, i) => ({ sector: z.zone.sector, allocs: actual[i], usedSqm: sum(actual[i].map((a) => a.areaSqm)) }));
  const single = zones.length === 1;

  const water = waterPlan(input, parts, used);
  const drainage = drainagePlan(input, parts.map((p) => p.sector), used, plot.widthM, plot.lengthM);
  const electrical = electricalPlan(input, parts, used, water.pumpHp);
  // drawn from the same targets as the measured placeholder (only the utilities differ), so what is priced is what is drawn
  const layout = buildLayout(plot, targets, {
    tank: water.tankLitres > 0,
    pump: water.pumpHp > 0,
    power: electrical.totalW > 0,
  });

  // ---- costs: each type's own part, then what the types share ----
  const sf = scaleFactor(used);
  const own = parts.map((p, i) => {
    const z = zones[i].zone;
    const perimeter = single ? plot.widthM + plot.lengthM : (z.region.x1 - z.region.x0) + (z.region.y1 - z.region.y0);
    return {
      sector: p.sector,
      production: sum(p.allocs.map((a) => a.areaSqm * a.item.startupCostPerSqm * sf)),
      frames: z.bedMode ? p.usedSqm * 120 : 0, // raised-bed frames, topsoil & compost
      fencing: z.bedMode ? 2 * perimeter * 50 : 0, // fence / pest net around the beds
      workingCapital: sum(p.allocs.map((a) => a.areaSqm * a.item.opCostPerSqmMonth * clamp(a.item.cycleDays / 30, 1, 3))),
      pipe: PIPE_COST[p.sector](p.usedSqm),
      tools: TOOLS_COST[p.sector](p.usedSqm),
    };
  });
  const total = (k: Exclude<keyof (typeof own)[number], 'sector'>) => sum(own.map((o) => o[k]));
  const production = total('production');
  const frames = total('frames');
  const fencing = total('fencing');
  const workingCapital = total('workingCapital');
  const tools = total('tools');
  const tankCost = water.tankLitres * 6;
  const pumpCost = ({ 0: 0, 0.5: 3500, 1: 7000, 2: 14000, 3: 22000 } as Record<number, number>)[water.pumpHp] ?? 0;
  const waterCost = tankCost + pumpCost + total('pipe');
  const drainCost = drainage.canalLengthM * (used < 10 ? 30 : 60);
  const elecCost = electrical.totalW > 0
    ? 2500 + (input.site.power === 'grid' ? 0 : electrical.solarKwp * 55000)
    : 0;
  const permits = input.goal === 'commercial' ? 10000 : input.goal === 'family_sell' && used >= 100 ? 2000 : 0;
  const subtotal = production + frames + fencing + workingCapital + waterCost + drainCost + elecCost + tools + permits;
  const contingency = subtotal * 0.1;

  const breakdown: CostLine[] = [
    ...own.map((o) => ({ label: PRODUCTION_LABEL[o.sector], amount: o.production })),
    { label: 'Raised-bed frames, topsoil & compost', amount: frames },
    { label: 'Fencing / pest netting', amount: fencing },
    { label: 'Water system (tank, pump, piping)', amount: waterCost },
    { label: 'Drainage canals', amount: drainCost },
    { label: input.site.power === 'grid' ? 'Electrical wiring & protection' : 'Electrical / solar kit', amount: elecCost },
    { label: 'Tools & equipment', amount: tools },
    { label: 'Permits & registration allowance', amount: permits },
    { label: 'Working capital (first operating months)', amount: workingCapital },
    { label: 'Contingency (10%)', amount: contingency },
  ].filter((l) => l.amount > 0).map((l) => ({ ...l, amount: Math.round(l.amount) }));
  const initial = sum(breakdown.map((b) => b.amount));

  const utilities =
    electrical.dailyKwh * 30 * (input.site.power === 'grid' ? GRID_KWH_PESO : 0) +
    (input.site.waterSource === 'municipal' ? (water.demandLPerDay * 30 / 1000) * WATER_PESO_PER_M3 : 0);
  const monthlyOperating = Math.round(sum(all.map((a) => a.areaSqm * a.item.opCostPerSqmMonth)) + utilities);

  const incomeOf = (a: AllocTarget, mult: number) => (a.areaSqm * a.item.yieldKgPerSqm * a.item.farmGatePerKg * mult * 30) / a.item.cycleDays;
  const incomeAt = (mult: number) => sum(all.map((a) => incomeOf(a, mult)));
  const monthlyIncomeMin = Math.round(incomeAt(0.7));
  const monthlyIncomeMax = Math.round(incomeAt(input.goal === 'commercial' ? 1.05 : 1.2));
  const net = (monthlyIncomeMin + monthlyIncomeMax) / 2 - monthlyOperating;
  // the wait before income starts, weighted by what each item earns (a mango that pays later counts for its share only)
  const incomeTotal = incomeAt(1);
  const firstHarvestMonths = (incomeTotal > 0
    ? sum(all.map((a) => incomeOf(a, 1) * a.item.daysToHarvest)) / incomeTotal
    : sum(all.map((a) => a.item.daysToHarvest)) / all.length) / 30;
  const paybackMonths = net > 0 ? Math.round((initial / net + firstHarvestMonths) * 10) / 10 : null;

  const allocations: Allocation[] = all.map((a) => ({ itemId: a.item.id, areaSqm: Math.round(a.areaSqm * 10) / 10 }));
  let split: PlanResult['split'];
  if (!single) {
    const zonesOut: PlanZone[] = own.map((o, i) => ({
      sector: o.sector,
      landSqm: Math.round(zones[i].zone.landSqm),
      usedAreaSqm: Math.round(parts[i].usedSqm * 10) / 10,
      initial: Math.round((o.production + o.frames + o.fencing + o.workingCapital + o.pipe + o.tools) * 1.1),
    }));
    split = { zones: zonesOut, shared: Math.max(0, initial - sum(zonesOut.map((z) => z.initial))) };
  }
  return {
    parts,
    result: {
      allocations,
      usedAreaSqm: Math.round(used * 10) / 10,
      cost: { initial, monthlyOperating, monthlyIncomeMin, monthlyIncomeMax, paybackMonths, breakdown },
      layout,
      water,
      drainage,
      electrical,
      ...(split ? { split } : {}),
    },
  };
}

function buildSchedule(parts: Part[], water: PlanResult['water'], layout: PlanResult['layout']): ScheduleItem[] {
  const s: ScheduleItem[] = [
    { week: 1, title: 'Confirm permits & prepare the site', detail: 'Check zoning and permits with your LGU (see Permits). Clear the site and mark the layout.' },
    { week: 1, title: 'Dig drainage & set the grade', detail: 'Cut the canal on the low side first so water has somewhere to go before anything is built.' },
  ];
  const water2 = water.tankLitres > 0 ? `Install the ${water.tankLitres} L tank` : 'Set up the water supply line';
  s.push({ week: 2, title: 'Water & utilities', detail: `${water2}${water.pumpHp ? `, a ${water.pumpHp} HP pump` : ''} and piping.` });

  for (const { sector, allocs } of parts) {
    if (sector === 'crops') {
      s.push({ week: 2, title: 'Build beds & add compost', detail: 'Raise beds 20-30 cm, mix in compost, install trellis posts for climbing crops.' });
      for (const a of allocs) {
        s.push({ week: 3, title: `Plant ${a.item.name}`, detail: `${Math.round(a.areaSqm * 10) / 10} sqm. ${a.item.notes}` });
        s.push({ week: 3 + Math.ceil(a.item.daysToHarvest / 7), title: `First ${a.item.name} harvest`, detail: 'Record kilos harvested and sell the same day while fresh.' });
      }
    } else if (sector === 'fruits') {
      s.push({ week: 2, title: 'Mark the spacing & dig planting holes', detail: 'Stake where each tree, mat or post goes, dig holes about 50-60 cm wide and deep (beds for pineapple and watermelon), and mix in compost.' });
      for (const a of allocs) {
        const plants = plantsLabel(a.item, a.areaSqm, layout.rects.filter((x) => x.itemId === a.item.id && x.kind === 'orchard'));
        s.push({ week: 3, title: `Plant ${a.item.name}`, detail: `${Math.round(a.areaSqm * 10) / 10} sqm${plants ? `, ${plants}` : ''}. ${a.item.notes}` });
        s.push({
          week: 3 + Math.ceil(a.item.daysToHarvest / 7),
          title: `First ${a.item.name} harvest`,
          detail: a.item.daysToHarvest > 365
            ? `${waitLabel(a.item.daysToHarvest)[0].toUpperCase()}${waitLabel(a.item.daysToHarvest).slice(1)} after planting. The first harvests are small and grow each year; record kilos and sales in the app.`
            : 'Record kilos harvested and sell while fresh.',
        });
      }
    } else if (sector === 'fish') {
      s.push({ week: 2, title: 'Dry, lime and fill ponds', detail: 'Sun-dry the base, apply lime as advised locally, fill slowly through a screened inlet and let the water settle.' });
      for (const a of allocs) {
        s.push({ week: 3, title: `Stock ${a.item.name}`, detail: 'Buy fingerlings from an accredited hatchery; stock in the early morning and acclimatize slowly.' });
        s.push({ week: 3 + Math.ceil(a.item.daysToHarvest / 7), title: `Harvest ${a.item.name}`, detail: 'Do a sample harvest first, then sell at the size your buyers want.' });
      }
    } else {
      s.push({ week: 2, title: 'Finish housing & biosecurity', detail: 'Dry roofed housing, fenced run, footbath and a separate quarantine pen. Register the farm with your LGU veterinarian.' });
      for (const a of allocs) {
        s.push({ week: 3, title: `Start ${a.item.name}`, detail: 'Source healthy stock from a trusted supplier and follow the vaccination program given by your vet.' });
        s.push({ week: 3 + Math.ceil(a.item.daysToHarvest / 7), title: `First ${a.item.name} sales`, detail: 'Arrange your buyer in advance and secure movement/health certificates.' });
      }
    }
  }
  s.push({ week: 4, title: 'Weekly routine', detail: 'Check water, drainage, animals/crops, pests and disease every day; record expenses and harvests in the app.' });
  s.sort((a, b) => a.week - b.week);
  return s;
}

/** Ranks what fits each part of the plot. Types where nothing fits are reported, so the caller can leave them out. */
function rankZones(input: PlanInput, sectors: Sector[]) {
  const warnings: string[] = [];
  const plot = planPlot(sectors, input.areaSqm);
  const zones = plot.zones.map((zone) => {
    const bedArea = zone.grid ? zone.grid.bedW * zone.grid.bedLen : 1;
    const cap = zoneCapacity(zone, zone.sector === 'livestock');
    return { zone, cap, bedArea, ranked: rankCandidates(input, zone.sector, cap, zone.bedMode, bedArea, warnings, sectors.length > 1) };
  });
  return { plot, zones, warnings };
}

export function generatePlan(input: PlanInput): PlanResult {
  const chosenSectors = planSectors(input);
  let sectors = chosenSectors;
  let pass = rankZones(input, sectors);
  // a type where nothing fits its share of the land is left out, and the others share the land
  const dropped: Sector[] = [];
  while (pass.zones.some((z) => z.ranked.length === 0)) {
    const none = pass.zones.filter((z) => z.ranked.length === 0).map((z) => z.zone.sector);
    if (none.length === pass.zones.length) break;
    dropped.push(...none);
    sectors = sectors.filter((s) => !none.includes(s));
    pass = rankZones(input, sectors);
  }
  if (pass.zones.every((z) => z.ranked.length === 0)) {
    return emptyPlan(input, chosenSectors, chosenSectors.length === 1
      ? `We couldn't find a ${SECTOR_SHORT[chosenSectors[0]].toLowerCase()} option that fits this area and site. Try a larger area, a different sector, or a different site setting.`
      : `We couldn't find options of these types (${chosenSectors.map((s) => SECTOR_SHORT[s].toLowerCase()).join(', ')}) that fit this area and site. Try a larger area, fewer types, or a different site setting.`);
  }
  const warnings = pass.warnings;
  const { plot } = pass;

  const zones: ZonePlan[] = pass.zones.map(({ zone, cap, bedArea, ranked }) => {
    // own picks: all of them, in the user's order; otherwise the best few suggestions
    const userPicked = pickedItems(input, zone.sector).length > 0;
    const chosen = userPicked ? ranked : ranked.slice(0, Math.min(chooseCount(zone.sector, cap, zone.bedMode, zone.grid?.slots.length ?? 0), ranked.length));
    const totalScore = sum(chosen.map((c) => c.score));
    const shares = chosen.map((c) => 0.5 * (c.score / totalScore) + 0.5 / chosen.length);
    return { zone, cap, bedArea, chosen, shares, userPicked };
  });
  const cap = sum(zones.map((z) => z.cap));

  // shrink the planted area of every type by the same factor until the start-up cost fits the capital
  let f = 1;
  let best: Attempt | null = null;
  // (shrinks until it fits; if even the smallest sensible plan is too costly we report the shortfall)
  while (f >= 0.01) {
    const a = buildAttempt(input, plot, zones, f);
    if (!a) break; // below the smallest sensible size: keep the last valid (smallest) plan
    best = a;
    if (a.result.cost.initial <= input.capital) break;
    f *= 0.92;
  }
  if (!best) return emptyPlan(input, chosenSectors, 'This area is too small to lay out a sensible plan for this option. Try a larger area or a different sector.');

  const mixed = zones.length > 1;
  const what = mixed ? 'this mix' : 'this option';
  const r = best.result;
  const phased = f < 0.999 || (r.cost.initial > input.capital);
  if (r.cost.initial > input.capital) {
    warnings.unshift(`Your capital (${peso(input.capital)}) is below the estimated minimum start-up cost of ${peso(r.cost.initial)} for ${what}. Consider saving more, choosing a cheaper crop/animal${mixed ? ', fewer types' : ''}, or starting with a smaller pilot.`);
  } else if (phased) {
    warnings.unshift(`Your capital (${peso(input.capital)}) covers about ${Math.round(r.usedAreaSqm)} sqm of the ${Math.round(cap)} sqm available. Start with this phase and expand using your first earnings.`);
  }
  if (mixed && input.areaSqm / zones.length < 25) {
    warnings.push(`About ${Math.round(input.areaSqm / zones.length)} sqm for each of the ${zones.length} types is very little room. On ${input.areaSqm.toLocaleString()} sqm, fewer types give a more workable plan.`);
  }
  if (dropped.length) {
    const share = Math.round(input.areaSqm / chosenSectors.length);
    warnings.push(`${dropped.map((s) => SECTOR_SHORT[s]).join(' and ')} left out: nothing of ${dropped.length === 1 ? 'that type' : 'those types'} suits about ${share.toLocaleString()} sqm (an even share of your land) with this site's sun, water and size, so the other ${sectors.length === 1 ? 'type uses' : 'types use'} the whole plot. Change the site answers, the area or the mix to try again.`);
  }
  if (input.site.waterSource === 'municipal' && r.water.demandLPerDay > 5000) warnings.push('Municipal water at this volume is very costly. Plan a well, stream or canal supply (check NWRB rules) to keep operating costs realistic.');
  if (input.site.waterSource === 'none') warnings.push('You have no water source yet - secure one before planting or stocking.');
  if (input.site.floodProne) warnings.push('Flood-prone site: raise beds/structures, keep canals clear, and avoid planting before the heavy-rain months.');
  if (input.site.sunlight === 'shaded' && sectors.includes('crops')) warnings.push('Heavy shade limits most vegetables. Only shade-tolerant leafy crops were considered; trim trees or choose a sunnier spot if you can.');
  if (input.site.sunlight === 'shaded' && sectors.includes('fruits')) warnings.push('Heavy shade: most fruit trees need full sun to bear well, so only shade-tolerant ones (like lanzones) were suggested.');
  const chosenItems = r.allocations.map((a) => catalogById(a.itemId)).filter((x): x is CatalogItem => !!x);
  for (const z of zones) {
    if (!z.userPicked) continue;
    const left = z.chosen.filter((c) => !r.allocations.some((a) => a.itemId === c.item.id)).map((c) => c.item.name);
    if (left.length) warnings.push(`Not enough space or capital for everything you picked: ${left.join(', ')} ${left.length === 1 ? 'was' : 'were'} left out of this phase. Add ${left.length === 1 ? 'it' : 'them'} when you expand, or pick fewer items.`);
  }
  if (chosenItems.some((i) => i.prefersCool) && !input.site.cool) warnings.push('Lettuce prefers cool highland conditions. Use shade net and the cooler months in lowlands.');
  const slow = chosenItems.filter((i) => i.daysToHarvest > 365);
  if (slow.length) {
    const fast = chosenItems.some((i) => i.daysToHarvest <= 365);
    warnings.push(`${slow.map((i) => `${i.name} (${waitLabel(i.daysToHarvest)})`).join(', ')}: no harvest for more than a year after planting. The monthly income shown is for when everything is bearing; ${fast ? 'until then it comes from your other items.' : 'until then, plan for other income.'}`);
  }
  if (sectors.includes('fruits')) warnings.push('Buy planting material (grafted seedlings, suckers, cuttings) from a BPI-accredited nursery or a trusted grower, so it is true to type and free of disease.');
  if (sectors.includes('fish')) warnings.push('Register your aquafarm with BFAR/LGU and buy fingerlings only from accredited hatcheries (see Permits).');
  if (sectors.includes('livestock')) warnings.push('Register your livestock/poultry farm with your LGU veterinarian and set up biosecurity (see Permits and Health).');
  if (r.cost.paybackMonths === null) warnings.push('At these assumptions the project does not pay back. Check prices, reduce costs, or choose another option.');
  if (input.aiSiteNotes?.length) input.aiSiteNotes.forEach((n2) => warnings.push(`Site photo note: ${n2}`));

  const names = chosenItems.map((i) => i.name).join(', ');
  const assumptions = [
    'All costs, yields and prices are planning estimates for the Philippines and will vary by location, season and management.',
    'Income range: low = 70% of expected yield at farm-gate price; high = full yield with a modest premium for direct selling.',
    'Start-up cost includes one to three months of operating cost as working capital and a 10% contingency.',
    'The site layout assumes the low side of your land faces south; rotate the plan to match your actual slope.',
    'Water, drainage and electrical sizing is a first-pass design. Have a licensed professional review it before building.',
  ];
  if (mixed) assumptions.push(`Mixed farm: the land is split evenly between the ${zones.length} types (about ${Math.round(input.areaSqm / zones.length).toLocaleString()} sqm each), and one budget covers them all. They share one water tank, drainage canal, power line and permit allowance, so those are counted once.`);
  if (sectors.includes('fruits')) assumptions.push('Fruit trees: yields are per year for trees at bearing age; the first harvests are smaller.');
  return {
    title: titleFor(input, sectors),
    summary: `Start with about ${Math.round(r.usedAreaSqm)} sqm of ${names}. Estimated start-up ${peso(r.cost.initial)}${phased ? ' for the first phase' : ''}.`,
    ...r,
    phased,
    schedule: buildSchedule(best.parts, r.water, r.layout),
    warnings,
    assumptions,
  };
}

function emptyPlan(input: PlanInput, sectors: Sector[], message: string): PlanResult {
  const { widthM, lengthM } = plotDims(sectors, input.areaSqm);
  return {
    title: titleFor(input, sectors),
    summary: message,
    allocations: [],
    usedAreaSqm: 0,
    phased: false,
    cost: { initial: 0, monthlyOperating: 0, monthlyIncomeMin: 0, monthlyIncomeMax: 0, paybackMonths: null, breakdown: [] },
    layout: { widthM, lengthM, rects: [], lowSide: 'S', legend: [] },
    water: { demandLPerDay: 0, tankLitres: 0, tankDays: 0, source: '', pumpHp: 0, method: '', steps: [] },
    drainage: { canalLengthM: 0, canalSize: '', slopePct: 0, retentionM3: 0, steps: [] },
    electrical: { loadsW: [], totalW: 0, dailyKwh: 0, solarKwp: 0, steps: [] },
    schedule: [],
    warnings: [message],
    assumptions: [],
  };
}
