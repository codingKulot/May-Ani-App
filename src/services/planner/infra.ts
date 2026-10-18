import type { DrainagePlan, ElectricalPlan, PlanInput, WaterPlan } from '@/types';
import type { AllocTarget } from './layout';

const TANK_SIZES = [200, 500, 1000, 2000, 3000, 5000, 10000, 20000, 50000];

const SOURCE_TEXT: Record<PlanInput['site']['waterSource'], string> = {
  none: 'No water source yet. Start with rainwater harvesting from a roof into a tank, and plan a shallow well (check NWRB / LGU rules before drilling).',
  municipal: 'Municipal (Water District / LGU) supply. Keep a storage tank as backup for interruptions.',
  well: 'Your well or deep well. Test the water (salinity, iron, bacteria) before using it for fish or animals.',
  stream: 'Stream / canal / spring. Use gravity or a pump with an intake screen; confirm water rights with NWRB or your irrigators association.',
  rain: 'Rainwater harvesting. Every 1 mm of rain on 1 sqm of roof gives about 0.8 L - size your roof and tank for the dry spell.',
};

function pumpHpFor(demand: number, source: PlanInput['site']['waterSource']): number {
  if (source === 'municipal' && demand < 1000) return 0;
  if (demand < 500) return 0;
  if (demand < 3000) return 0.5;
  if (demand < 15000) return 1;
  if (demand < 50000) return 2;
  return 3;
}

export function waterPlan(input: PlanInput, allocs: AllocTarget[], usedArea: number): WaterPlan {
  const demand = Math.round(allocs.reduce((s, a) => s + a.areaSqm * a.item.waterLPerSqmDay, 0));
  const direct = demand > 20000;
  let tank = 0;
  const tiny = demand < 60 && input.site.waterSource !== 'rain' && input.site.waterSource !== 'none';
  if (!direct && !tiny) {
    // fish ponds are filled straight from the source, so only a small buffer/settling tank is sized
    const days = input.sector === 'fish' ? 0.5 : 2;
    const need = Math.max(200, demand * days);
    tank = TANK_SIZES.find((t) => t >= need) ?? TANK_SIZES[TANK_SIZES.length - 1];
  }
  const pumpHp = pumpHpFor(demand, input.site.waterSource);
  const steps: string[] = [];
  let method = '';

  if (input.sector === 'crops') {
    method = usedArea < 30 ? 'Hand watering in the morning, optionally a simple drip kit' : 'Drip irrigation lines on every bed, fed from the tank';
    steps.push(
      tiny
        ? 'Water by hand with a watering can or buckets in the morning - no tank is needed at this size.'
        : usedArea < 30
        ? 'Place a 200 L drum or tank on a stand at the garden edge and water with a can or a gravity hose in the morning.'
        : 'Install a tank on a stand (about 1 m high) for gravity feed, or a pump-fed header line.',
      'Run 1-2 drip lines per bed and flush the ends monthly to prevent clogging.',
      'Water in the early morning; mulch to cut water use by up to a third.',
    );
  } else if (input.sector === 'fish') {
    method = 'Gravity inlet pipe with screen, standpipe (monk) outlet on the low side';
    steps.push(
      'Fit a screened inlet at the high side and a standpipe or sluice drain at the low side of each pond.',
      'Fill ponds slowly and let the water settle for several days before stocking; a depth of 0.8-1.2 m is typical for small ponds.',
      'Plan 10-20% weekly water exchange for intensive ponds, and a top-up line for evaporation and seepage.',
    );
  } else {
    method = 'Raised drinkers/troughs fed by a gravity line from the tank';
    steps.push(
      'Install nipple drinkers or covered troughs so water stays clean and dry bedding stays dry.',
      'Place the tank higher than the housing so water flows by gravity.',
      'Clean drinkers daily; animals drink much more in hot weather.',
    );
  }
  if (direct) {
    steps.push('Daily demand is too large for a storage tank: plan a direct canal or pump supply with a reliable source, ideally irrigated by a group or cooperative.');
  }
  if (input.site.waterSource === 'none' && input.sector === 'fish') {
    steps.push('Fish cannot be farmed without a dependable water supply - secure a source before building ponds.');
  }

  return {
    demandLPerDay: demand,
    tankLitres: tank,
    tankDays: tank && demand ? Math.round((tank / demand) * 10) / 10 : 0,
    source: SOURCE_TEXT[input.site.waterSource],
    pumpHp,
    method,
    steps,
  };
}

export function drainagePlan(input: PlanInput, usedArea: number, widthM: number, lengthM: number): DrainagePlan {
  const slopePct = input.site.slope === 'steep' ? 0.5 : input.site.slope === 'flat' ? 1.5 : 1;
  const flood = input.site.floodProne;
  const canalLengthM = Math.round(widthM + (flood ? widthM + 2 * lengthM : 0));
  const canalSize = usedArea <= 200 ? '0.3 m wide x 0.3 m deep' : usedArea <= 2000 ? '0.5 m wide x 0.5 m deep' : '1.0 m wide x 0.8 m deep';
  // 100 mm design storm x runoff coefficient 0.5 -> 0.05 m3 per sqm
  const retentionM3 = Math.round(usedArea * 0.1 * 0.5 * 10) / 10;
  const steps: string[] = [
    `Dig the main drainage canal along the low (south) edge, ${canalSize}, grading it ${slopePct}% toward the outlet so water never stands.`,
  ];
  if (input.sector === 'crops') {
    steps.push('Make beds 20-30 cm high so roots stay out of standing water, and keep the paths between beds as mini drains.');
  } else if (input.sector === 'fish') {
    steps.push('Keep pond dikes at least 0.5 m above the highest water level and compact them well to prevent seepage and breaks.');
  } else {
    steps.push('Raise the floor of the housing above ground level and slope the yard away from it so manure and water drain outward, not inward.');
  }
  if (input.site.slope === 'steep') {
    steps.push('Steep slope: build contour terraces or bunds and a cut-off drain upslope; plant grass on canal edges to stop erosion.');
  }
  if (flood) {
    steps.push('Flood-prone site: add an upslope interceptor drain, raise the structures further, and keep an overflow outlet clear for typhoon rains.');
  }
  steps.push(`Allow about ${retentionM3} m3 of water storage or a soakaway for a 100 mm rainstorm so runoff does not damage neighbors or the farm.`);
  return { canalLengthM, canalSize, slopePct, retentionM3, steps };
}

export function electricalPlan(
  input: PlanInput,
  allocs: AllocTarget[],
  usedArea: number,
  pumpHp: number,
): ElectricalPlan {
  const loads: { label: string; watts: number; hoursPerDay: number }[] = [];
  if (pumpHp > 0) loads.push({ label: `Water pump (${pumpHp} HP)`, watts: Math.round(pumpHp * 746), hoursPerDay: 1.5 });

  if (input.sector === 'fish') {
    // extensive bangus ponds don't need mechanical aeration; size it for the intensive species only
    const intensiveArea = allocs.filter((a) => a.item.id !== 'bangus').reduce((s, a) => s + a.areaSqm, 0);
    if (intensiveArea > 0) {
      loads.push({ label: 'Aeration (blower / paddlewheel)', watts: Math.round(Math.max(60, intensiveArea * 0.8)), hoursPerDay: 12 });
    }
  }
  if (input.sector === 'livestock') {
    loads.push({ label: 'House lighting (LED)', watts: Math.round(Math.max(20, usedArea * 1.5)), hoursPerDay: 6 });
    if (allocs.some((a) => a.item.id === 'broiler')) {
      loads.push({ label: 'Brooder heating (first 2 weeks, averaged)', watts: Math.round(Math.max(100, usedArea * 25)), hoursPerDay: 3 });
    }
  }
  if (usedArea >= 50) loads.push({ label: 'Security light (LED)', watts: 20, hoursPerDay: 10 });

  const totalW = loads.reduce((s, l) => s + l.watts, 0);
  const dailyKwh = Math.round(loads.reduce((s, l) => s + (l.watts * l.hoursPerDay) / 1000, 0) * 100) / 100;
  const solarKwp = dailyKwh > 0 ? Math.max(0.2, Math.ceil((dailyKwh / (4 * 0.75)) * 10) / 10) : 0;

  const steps: string[] = [];
  if (loads.length === 0) {
    steps.push('No electrical load is needed at this size. A small solar garden light or lantern is optional.');
  } else {
    if (input.site.power === 'grid') {
      steps.push('Connect to grid power with a dedicated, weatherproof circuit breaker panel; add GFCI/RCD protection for pumps and any wet area.');
    } else {
      steps.push(`Solar option: about ${solarKwp} kWp of panels plus battery/inverter sized for ${dailyKwh} kWh per day (assumes about 4 sun-hours; add margin for cloudy days).`);
    }
    steps.push('Have wiring designed and installed by a licensed Registered Electrical Engineer / Master Electrician and keep cables away from water and animals.');
    steps.push('Secure panels and outdoor equipment for typhoon winds and keep a manual backup for pumps and aeration.');
  }
  return { loadsW: loads, totalW, dailyKwh, solarKwp, steps };
}
