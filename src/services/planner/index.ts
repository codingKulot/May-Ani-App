import { itemsFor, catalogById, SECTOR_SHORT } from '@/data/catalog';
import type {
  Allocation, CatalogItem, CostLine, Experience, PlanInput, PlanResult, ScheduleItem,
} from '@/types';
import { clamp, peso, sum } from '@/lib/format';
import { buildLayout, cropGrid, plotDims, productionCapacity, measuredAreas, type AllocTarget } from './layout';
import { drainagePlan, electricalPlan, waterPlan } from './infra';

export { cropGrid, plotDims } from './layout';

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

/** Smallest sensible block for an item on THIS plot (a single bed for small crop plots). */
function effectiveMin(input: PlanInput, item: CatalogItem, cap: number, bedMode: boolean, bedArea: number): number {
  if (bedMode && input.sector === 'crops') return bedArea;
  return Math.min(item.minAreaSqm, cap * 0.5);
}

interface Candidate { item: CatalogItem; score: number }

type Unsuitable = { code: 'difficulty' | 'area' | 'brackish' | 'fresh' | 'scale' | 'cool' | 'shade'; text: string };

/** Why an item does not suit this site (null when it does); `text` reads after "<item> ...". Used to filter suggestions and to warn about the user's own picks. */
function unsuitable(input: PlanInput, i: CatalogItem, cap: number, bedMode: boolean, bedArea: number, maxDiff: number, relaxArea: boolean): Unsuitable | null {
  if (i.difficulty > maxDiff) return { code: 'difficulty', text: `is rated harder than your experience level. Get hands-on guidance from your municipal agriculture/fisheries office first.` };
  const min = bedMode && input.sector === 'crops' ? bedArea : i.minAreaSqm;
  if (!relaxArea && min > cap) return { code: 'area', text: `usually needs at least ${Math.round(min)} sqm, more than this space has. Treat it as a small trial.` };
  if (i.needsBrackish && !input.site.brackishWater) return { code: 'brackish', text: `needs brackish (salty) water and your site is set to fresh water.` };
  if (i.freshOnly && input.site.brackishWater) return { code: 'fresh', text: `needs fresh water and your site is set to brackish water.` };
  if (!bedMode && input.sector === 'crops' && i.category === 'Leafy vegetable') return { code: 'scale', text: `is hard to sell at this farm size: leafy greens spoil fast in large volumes. Plan your buyers first.` }; // not marketable at hectare scale
  if (i.prefersCool && !input.site.cool && input.experience !== 'advanced') return { code: 'cool', text: '' }; // the general "prefers cool" warning covers it
  if (input.site.sunlight === 'shaded' && input.sector === 'crops' && HARD_SUNLIGHT.has(i.category)) return { code: 'shade', text: `needs more sun than your site gets.` };
  return null;
}

/** The user's own picks (only items that exist in this sector), in the order they were picked. */
function pickedItems(input: PlanInput): CatalogItem[] {
  const ids = new Set(itemsFor(input.sector).map((i) => i.id));
  return (input.preferred ?? []).filter((id, k, a) => ids.has(id) && a.indexOf(id) === k).map((id) => catalogById(id)!).filter(Boolean);
}

function scoreItem(input: PlanInput, item: CatalogItem, cap: number, bedMode: boolean): number {
  const e = economics(item, cap);
  let score = e.profitMo > 0 ? e.profitMo / Math.sqrt(e.initialPerSqm) : 0.01;
  if (item.difficulty === 1) score *= input.goal === 'commercial' ? 1 : 1.2;
  if (item.difficulty === 3) score *= 0.75;
  if (item.prefersCool && !input.site.cool) score *= 0.5;
  if (input.sector === 'crops' && !bedMode) {
    // hectare-scale farms: field crops and fruiting vegetables suit the scale better than leafy micro-crops
    if (item.category === 'Field crop') score *= 2.5;
    else if (item.category === 'Leafy vegetable') score *= 0.4;
  }
  if (input.sector === 'crops' && input.site.sunlight === 'partial' && HARD_SUNLIGHT.has(item.category)) score *= 0.8;
  return score;
}

function rankCandidates(input: PlanInput, cap: number, bedMode: boolean, bedArea: number, warnings: string[]): Candidate[] {
  const lvl = EXP_LEVEL[input.experience];

  // The user picked what to grow: use exactly those, and say plainly when one does not suit the site.
  const picked = pickedItems(input);
  if (picked.length) {
    for (const i of picked) {
      const why = i.custom ? null : unsuitable(input, i, cap, bedMode, bedArea, lvl, false);
      if (why?.text) warnings.push(`You picked ${i.name}, but it ${why.text}`);
    }
    return picked.map((item) => ({ item, score: scoreItem(input, item, cap, bedMode) }));
  }

  const pool = (maxDiff: number, relaxArea: boolean) =>
    itemsFor(input.sector).filter((i) => !unsuitable(input, i, cap, bedMode, bedArea, maxDiff, relaxArea));

  let items = pool(lvl, false);
  if (items.length === 0) {
    items = pool(Math.min(3, lvl + 1), false);
    if (items.length > 0) warnings.push('No beginner-level option fits this size, so the plan includes a harder option. Get hands-on guidance from your municipal agriculture/fisheries office first.');
  }
  if (items.length === 0) {
    items = pool(3, true);
    if (items.length > 0) warnings.push('This area is smaller than usually recommended for the options in this category. Treat the plan as a pilot and expect lower efficiency.');
  }

  return items.map((item) => ({ item, score: scoreItem(input, item, cap, bedMode) })).sort((a, b) => b.score - a.score);
}

function chooseCount(sector: PlanInput['sector'], cap: number, bedMode: boolean, slots: number): number {
  if (sector === 'crops') {
    if (bedMode) return clamp(slots >= 8 ? 4 : slots, 1, 4);
    return cap >= 2000 ? 3 : 2;
  }
  if (sector === 'fish') return cap < 300 ? 1 : 2;
  return cap >= 60 ? 2 : 1;
}

function titleFor(input: PlanInput): string {
  if (input.name.trim()) return input.name.trim();
  const a = input.areaSqm;
  if (input.sector === 'crops') return a <= 100 ? 'Backyard Vegetable Garden' : a <= 2000 ? 'Small Vegetable Farm' : 'Field Crop Farm';
  if (input.sector === 'fish') return a <= 100 ? 'Backyard Fish Tanks' : a <= 3000 ? 'Fishpond Project' : 'Aquaculture Farm';
  return a <= 60 ? 'Backyard Livestock Project' : 'Livestock Farm';
}

interface Attempt {
  allocations: Allocation[];
  targets: AllocTarget[];
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

function buildAttempt(input: PlanInput, chosen: Candidate[], shares: number[], cap: number, f: number, bedMode: boolean, bedArea: number): Attempt | null {
  let targets: AllocTarget[];
  if (bedMode && input.sector === 'crops') {
    // small plots: allocate whole beds (largest-remainder), at least one bed per crop
    const g = cropGrid(input.areaSqm);
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
    targets = items.map((c, i) => ({ item: c.item, areaSqm: beds[i] * g.bedW * g.bedLen }));
  } else {
    const areas = allocateWithCaps(chosen, shares, cap * f);
    targets = chosen
      .map((c, i) => ({ item: c.item, areaSqm: areas[i] }))
      .filter((t) => t.areaSqm >= effectiveMin(input, t.item, cap, bedMode, bedArea) * Math.min(1, f + 0.15));
  }
  if (targets.length === 0) return null;

  const placeholder = buildLayout(input.sector, input.areaSqm, targets, { tank: true, pump: false, power: false });
  const measured = measuredAreas(placeholder);
  const actual: AllocTarget[] = targets
    .map((t) => ({ item: t.item, areaSqm: measured.get(t.item.id) ?? 0 }))
    .filter((t) => t.areaSqm > 0);
  if (actual.length === 0) return null;
  const used = sum(actual.map((a) => a.areaSqm));

  const water = waterPlan(input, actual, used);
  const drainage = drainagePlan(input, used, placeholder.widthM, placeholder.lengthM);
  const electrical = electricalPlan(input, actual, used, water.pumpHp);
  const layout = buildLayout(input.sector, input.areaSqm, actual, {
    tank: water.tankLitres > 0,
    pump: water.pumpHp > 0,
    power: electrical.totalW > 0,
  });

  // ---- costs ----
  const sf = scaleFactor(used);
  const production = sum(actual.map((a) => a.areaSqm * a.item.startupCostPerSqm * sf));
  const workingCapital = sum(actual.map((a) => a.areaSqm * a.item.opCostPerSqmMonth * clamp(a.item.cycleDays / 30, 1, 3)));
  const tankCost = water.tankLitres * 6;
  const pumpCost = ({ 0: 0, 0.5: 3500, 1: 7000, 2: 14000, 3: 22000 } as Record<number, number>)[water.pumpHp] ?? 0;
  const pipeCost = input.sector === 'crops' ? used * 25 : input.sector === 'fish' ? 600 + used * 4 : 500 + used * 10;
  const waterCost = tankCost + pumpCost + pipeCost;
  const drainCost = drainage.canalLengthM * (used < 10 ? 30 : 60);
  const elecCost = electrical.totalW > 0
    ? 2500 + (input.site.power === 'grid' ? 0 : electrical.solarKwp * 55000)
    : 0;
  const tools = input.sector === 'crops' ? (used < 10 ? 300 : 800 + used * 0.5) : input.sector === 'fish' ? 1200 : 1000;
  const permits = input.goal === 'commercial' ? 10000 : input.goal === 'family_sell' && used >= 100 ? 2000 : 0;
  const frames = bedMode && input.sector === 'crops' ? used * 120 : 0; // raised-bed frames, topsoil & compost
  const fencing = bedMode && input.sector === 'crops' ? 2 * (placeholder.widthM + placeholder.lengthM) * 50 : 0; // fence / pest net
  const subtotal = production + frames + fencing + workingCapital + waterCost + drainCost + elecCost + tools + permits;
  const contingency = subtotal * 0.1;

  const breakdown: CostLine[] = [
    { label: input.sector === 'crops' ? 'Seeds, compost, trellis & bed preparation' : input.sector === 'fish' ? 'Pond/tank construction & fingerlings set-up' : 'Housing, fencing & starter stock set-up', amount: production },
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
  const monthlyOperating = Math.round(sum(actual.map((a) => a.areaSqm * a.item.opCostPerSqmMonth)) + utilities);

  const incomeAt = (mult: number) =>
    sum(actual.map((a) => (a.areaSqm * a.item.yieldKgPerSqm * a.item.farmGatePerKg * mult * 30) / a.item.cycleDays));
  const monthlyIncomeMin = Math.round(incomeAt(0.7));
  const monthlyIncomeMax = Math.round(incomeAt(input.goal === 'commercial' ? 1.05 : 1.2));
  const net = (monthlyIncomeMin + monthlyIncomeMax) / 2 - monthlyOperating;
  const firstHarvestMonths = sum(actual.map((a) => a.item.daysToHarvest)) / actual.length / 30;
  const paybackMonths = net > 0 ? Math.round((initial / net + firstHarvestMonths) * 10) / 10 : null;

  return {
    targets: actual,
    allocations: actual.map((a) => ({ itemId: a.item.id, areaSqm: Math.round(a.areaSqm * 10) / 10 })),
    result: {
      allocations: actual.map((a) => ({ itemId: a.item.id, areaSqm: Math.round(a.areaSqm * 10) / 10 })),
      usedAreaSqm: Math.round(used * 10) / 10,
      cost: { initial, monthlyOperating, monthlyIncomeMin, monthlyIncomeMax, paybackMonths, breakdown },
      layout,
      water,
      drainage,
      electrical,
    },
  };
}

function buildSchedule(input: PlanInput, allocs: AllocTarget[], water: PlanResult['water']): ScheduleItem[] {
  const s: ScheduleItem[] = [
    { week: 1, title: 'Confirm permits & prepare the site', detail: 'Check zoning and permits with your LGU (see Permits). Clear the site and mark the layout.' },
    { week: 1, title: 'Dig drainage & set the grade', detail: 'Cut the canal on the low side first so water has somewhere to go before anything is built.' },
  ];
  const water2 = water.tankLitres > 0 ? `Install the ${water.tankLitres} L tank` : 'Set up the water supply line';
  s.push({ week: 2, title: 'Water & utilities', detail: `${water2}${water.pumpHp ? `, a ${water.pumpHp} HP pump` : ''} and piping.` });

  if (input.sector === 'crops') {
    s.push({ week: 2, title: 'Build beds & add compost', detail: 'Raise beds 20-30 cm, mix in compost, install trellis posts for climbing crops.' });
    for (const a of allocs) {
      s.push({ week: 3, title: `Plant ${a.item.name}`, detail: `${Math.round(a.areaSqm * 10) / 10} sqm. ${a.item.notes}` });
      s.push({ week: 3 + Math.ceil(a.item.daysToHarvest / 7), title: `First ${a.item.name} harvest`, detail: 'Record kilos harvested and sell the same day while fresh.' });
    }
  } else if (input.sector === 'fish') {
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
  s.push({ week: 4, title: 'Weekly routine', detail: 'Check water, drainage, animals/crops, pests and disease every day; record expenses and harvests in the app.' });
  s.sort((a, b) => a.week - b.week);
  return s;
}

export function generatePlan(input: PlanInput): PlanResult {
  const warnings: string[] = [];
  const bedMode = input.sector === 'crops' && input.areaSqm <= 600;
  const grid = bedMode ? cropGrid(input.areaSqm) : null;
  const bedArea = grid ? grid.bedW * grid.bedLen : 1;
  const run = input.sector !== 'livestock' ? false : true;
  const cap = productionCapacity(input.sector, input.areaSqm, run);

  const ranked = rankCandidates(input, cap, bedMode, bedArea, warnings);
  if (ranked.length === 0) {
    return emptyPlan(input, `We couldn't find a ${SECTOR_SHORT[input.sector].toLowerCase()} option that fits this area and site. Try a larger area, a different sector, or a different site setting.`);
  }
  // own picks: all of them, in the user's order; otherwise the best few suggestions
  const userPicked = pickedItems(input).length > 0;
  const chosen = userPicked ? ranked : ranked.slice(0, Math.min(chooseCount(input.sector, cap, bedMode, grid?.slots.length ?? 0), ranked.length));
  const totalScore = sum(chosen.map((c) => c.score));
  const shares = chosen.map((c) => 0.5 * (c.score / totalScore) + 0.5 / chosen.length);

  // shrink the planted area until the start-up cost fits the capital
  let f = 1;
  let best: Attempt | null = null;
  // (shrinks until it fits; if even the smallest sensible plan is too costly we report the shortfall)
  while (f >= 0.01) {
    const a = buildAttempt(input, chosen, shares, cap, f, bedMode, bedArea);
    if (!a) break; // below the smallest sensible size: keep the last valid (smallest) plan
    best = a;
    if (a.result.cost.initial <= input.capital) break;
    f *= 0.92;
  }
  if (!best) return emptyPlan(input, 'This area is too small to lay out a sensible plan for this option. Try a larger area or a different sector.');

  const r = best.result;
  const phased = f < 0.999 || (r.cost.initial > input.capital);
  if (r.cost.initial > input.capital) {
    warnings.unshift(`Your capital (${peso(input.capital)}) is below the estimated minimum start-up cost of ${peso(r.cost.initial)} for this option. Consider saving more, choosing a cheaper crop/animal, or starting with a smaller pilot.`);
  } else if (phased) {
    warnings.unshift(`Your capital (${peso(input.capital)}) covers about ${Math.round(r.usedAreaSqm)} sqm of the ${Math.round(cap)} sqm available. Start with this phase and expand using your first earnings.`);
  }
  if (input.site.waterSource === 'municipal' && r.water.demandLPerDay > 5000) warnings.push('Municipal water at this volume is very costly. Plan a well, stream or canal supply (check NWRB rules) to keep operating costs realistic.');
  if (input.site.waterSource === 'none') warnings.push('You have no water source yet - secure one before planting or stocking.');
  if (input.site.floodProne) warnings.push('Flood-prone site: raise beds/structures, keep canals clear, and avoid planting before the heavy-rain months.');
  if (input.site.sunlight === 'shaded' && input.sector === 'crops') warnings.push('Heavy shade limits most vegetables. Only shade-tolerant leafy crops were considered; trim trees or choose a sunnier spot if you can.');
  const chosenItems = r.allocations.map((a) => catalogById(a.itemId)).filter((x): x is CatalogItem => !!x);
  if (userPicked) {
    const left = chosen.filter((c) => !r.allocations.some((a) => a.itemId === c.item.id)).map((c) => c.item.name);
    if (left.length) warnings.push(`Not enough space or capital for everything you picked: ${left.join(', ')} ${left.length === 1 ? 'was' : 'were'} left out of this phase. Add ${left.length === 1 ? 'it' : 'them'} when you expand, or pick fewer items.`);
  }
  if (chosenItems.some((i) => i.prefersCool) && !input.site.cool) warnings.push('Lettuce prefers cool highland conditions. Use shade net and the cooler months in lowlands.');
  if (input.sector === 'fish') warnings.push('Register your aquafarm with BFAR/LGU and buy fingerlings only from accredited hatcheries (see Permits).');
  if (input.sector === 'livestock') warnings.push('Register your livestock/poultry farm with your LGU veterinarian and set up biosecurity (see Permits and Health).');
  if (r.cost.paybackMonths === null) warnings.push('At these assumptions the project does not pay back. Check prices, reduce costs, or choose another option.');
  if (input.aiSiteNotes?.length) input.aiSiteNotes.forEach((n2) => warnings.push(`Site photo note: ${n2}`));

  const names = chosenItems.map((i) => i.name).join(', ');
  return {
    title: titleFor(input),
    summary: `Start with about ${Math.round(r.usedAreaSqm)} sqm of ${names}. Estimated start-up ${peso(r.cost.initial)}${phased ? ' for the first phase' : ''}.`,
    ...r,
    phased,
    schedule: buildSchedule(input, best.targets, r.water),
    warnings,
    assumptions: [
      'All costs, yields and prices are planning estimates for the Philippines and will vary by location, season and management.',
      'Income range: low = 70% of expected yield at farm-gate price; high = full yield with a modest premium for direct selling.',
      'Start-up cost includes one to three months of operating cost as working capital and a 10% contingency.',
      'The site layout assumes the low side of your land faces south; rotate the plan to match your actual slope.',
      'Water, drainage and electrical sizing is a first-pass design. Have a licensed professional review it before building.',
    ],
  };
}

function emptyPlan(input: PlanInput, message: string): PlanResult {
  const { widthM, lengthM } = plotDims(input.sector, input.areaSqm);
  return {
    title: titleFor(input),
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
