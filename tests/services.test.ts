import { describe, expect, test } from 'bun:test';
import { distanceToPolylineKm, haversineKm, polygonArea, areaFromReference } from '@/lib/geo';
import { nearestFault, faultAdvice, parseQuakes, quakeUrl } from '@/services/hazards';
import { advisories, parseOpenMeteo, describeCode, weatherUrl } from '@/services/weather';
import { applyOverrides, parseFeed, priceGap, referenceSnapshot, sellingOptions } from '@/services/market';
import { diagnoseOffline } from '@/services/health';
import { CATALOG } from '@/data/catalog';
import { PLACES, DEFAULT_PLACE, searchPlaces } from '@/data/places';
import { PERMITS, permitsFor } from '@/data/permits';
import { matchRoute } from '@/core/router';

describe('geo', () => {
  test('haversine: Manila -> Cebu is about 570 km', () => {
    const d = haversineKm({ lat: 14.599, lon: 120.984 }, { lat: 10.315, lon: 123.885 });
    expect(d).toBeGreaterThan(550);
    expect(d).toBeLessThan(600);
  });
  test('distance to polyline: point on a meridian line, 0.1 deg east of it, is ~11 km', () => {
    const r = distanceToPolylineKm({ lat: 10, lon: 120.1 }, [[9, 120], [11, 120]]);
    expect(r.km).toBeGreaterThan(10.5);
    expect(r.km).toBeLessThan(11.5);
    expect(r.nearest.lon).toBeCloseTo(120, 5);
  });
  test('distance to polyline clamps to the endpoint beyond the segment', () => {
    const r = distanceToPolylineKm({ lat: 12, lon: 120 }, [[9, 120], [11, 120]]);
    expect(r.nearest.lat).toBeCloseTo(11, 5);
    expect(r.km).toBeGreaterThan(110);
  });
  test('polygon area & scale reference', () => {
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    expect(polygonArea(sq)).toBe(10000);
    // reference: 100 px edge = 5 m  => the 100x100 px square is 5 m x 5 m = 25 sqm
    expect(areaFromReference(sq, { x: 0, y: 0 }, { x: 100, y: 0 }, 5)).toBeCloseTo(25, 6);
    expect(areaFromReference(sq, { x: 0, y: 0 }, { x: 0, y: 0 }, 5)).toBe(0);
    expect(polygonArea(sq.slice(0, 2))).toBe(0);
  });
});

describe('hazards', () => {
  test('a point on the West Valley Fault in Quezon City is within a few km of it', () => {
    const r = nearestFault({ lat: 14.65, lon: 121.1 })!;
    expect(r.fault.id).toMatch(/wvf|evf/);
    expect(r.km).toBeLessThan(6);
  });
  test('advice levels by distance', () => {
    expect(faultAdvice(2).level).toBe('high');
    expect(faultAdvice(12).level).toBe('medium');
    expect(faultAdvice(80).level).toBe('low');
  });
  test('parses a USGS GeoJSON response and computes distance', () => {
    const j = { features: [{ id: 'us1', properties: { mag: 5.4, place: '10 km N of Test', time: 1760600000000 }, geometry: { coordinates: [121.0, 15.5, 12.3] } }, { id: 'bad', properties: {}, geometry: {} }] };
    const q = parseQuakes(j, { lat: 15.0, lon: 121.0 });
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id: 'us1', mag: 5.4, depthKm: 12 });
    expect(q[0].distanceKm).toBeGreaterThan(50);
    expect(q[0].distanceKm).toBeLessThan(60);
  });
  test('quake url asks for the right box', () => {
    const u = quakeUrl({ lat: 15, lon: 121 }, 300, 14, new Date('2026-10-17T00:00:00Z'));
    expect(u).toContain('starttime=2026-10-03');
    expect(u).toContain('maxradiuskm=300');
  });
});

describe('weather', () => {
  const fixture = {
    current: { temperature_2m: 28.4, relative_humidity_2m: 80, precipitation: 0, weather_code: 2, wind_speed_10m: 11.2 },
    daily: {
      time: ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'],
      weather_code: [2, 63, 95, 1],
      temperature_2m_max: [32, 30, 37, 31],
      temperature_2m_min: [24, 24, 25, 24],
      precipitation_sum: [0, 62.4, 8, 0],
      precipitation_probability_max: [10, 90, 60, 5],
      wind_speed_10m_max: [14, 45, 66, 12],
    },
  };
  test('parses Open-Meteo', () => {
    const w = parseOpenMeteo(fixture);
    expect(w.current.tempC).toBe(28);
    expect(w.daily).toHaveLength(4);
    expect(w.daily[1].rainMm).toBe(62.4);
  });
  test('rejects a malformed response', () => {
    expect(() => parseOpenMeteo({})).toThrow();
  });
  test('derives advisories, worst first', () => {
    const a = advisories(parseOpenMeteo(fixture));
    expect(a[0].severity).toBe('danger');
    expect(a.some((x) => x.title.includes('Heavy rainfall'))).toBe(true);
    expect(a.some((x) => x.title.includes('Strong winds'))).toBe(true);
    expect(a.some((x) => x.title.includes('hot'))).toBe(true);
    expect(a.length).toBeLessThanOrEqual(4);
  });
  test('no advisories on a calm week', () => {
    const calm = { ...fixture, daily: { ...fixture.daily, weather_code: [1, 1, 1, 1], precipitation_sum: [0, 1, 0, 0], wind_speed_10m_max: [10, 12, 9, 8], temperature_2m_max: [31, 31, 30, 30] } };
    expect(advisories(parseOpenMeteo(calm))).toHaveLength(0);
  });
  test('code labels and url', () => {
    expect(describeCode(0).icon).toBe('sun');
    expect(describeCode(95).label).toBe('Thunderstorm');
    expect(weatherUrl({ lat: 1, lon: 2 })).toContain('timezone=Asia%2FManila');
  });
});

describe('market', () => {
  test('reference snapshot covers every catalog item and is labelled as not live', () => {
    const s = referenceSnapshot();
    expect(s.source).toBe('reference');
    expect(s.sourceLabel).toContain('not live');
    expect(s.prices.map((p) => p.itemId).sort()).toEqual(CATALOG.map((c) => c.id).sort());
    for (const p of s.prices) expect(p.retailPerKg).toBeGreaterThanOrEqual(p.farmGatePerKg);
  });
  test('gap and farmer share', () => {
    expect(priceGap({ retailPerKg: 100, farmGatePerKg: 40 })).toEqual({ gapPesos: 60, farmerSharePct: 40 });
  });
  test('feed parsing validates and drops bad rows', () => {
    const s = parseFeed({ asOf: '2026-10-17', label: 'Test', prices: [{ itemId: 'talong', retailPerKg: 90, farmGatePerKg: 48, trend7d: 2 }, { itemId: 'x', retailPerKg: -1, farmGatePerKg: 1 }] });
    expect(s.source).toBe('feed');
    expect(s.prices).toHaveLength(1);
    expect(() => parseFeed({ prices: [] })).toThrow();
  });
  test('manual overrides win and flag the source', () => {
    const s = applyOverrides(referenceSnapshot(), { talong: { retailPerKg: 120 } });
    expect(s.source).toBe('manual');
    expect(s.prices.find((p) => p.itemId === 'talong')!.retailPerKg).toBe(120);
  });
  test('selling options are ordered low to high', () => {
    const o = sellingOptions({ itemId: 'talong', retailPerKg: 100, farmGatePerKg: 50, trend7d: 0 }, 10);
    expect(o[0].total).toBeLessThan(o[1].total);
    expect(o[1].total).toBeLessThan(o[2].total);
  });
});

describe('health (offline)', () => {
  test('yellow older leaves on pechay -> nitrogen deficiency first', () => {
    const r = diagnoseOffline('the older leaves are turning yellow and the plant is stunted', 'plant', 'pechay');
    expect(r[0].id).toBe('n-deficiency');
    expect(r[0].confidence).toBeGreaterThan(30);
    expect(r[0].confidence).toBeLessThanOrEqual(85);
  });
  test('understands Filipino terms', () => {
    const r = diagnoseOffline('naninilaw ang dahon at bansot ang halaman', 'plant');
    expect(r[0].id).toBe('n-deficiency');
  });
  test('wilting eggplant with borer signs', () => {
    const r = diagnoseOffline('shoot wilting and holes in fruit, may uod sa talong', 'plant', 'talong');
    expect(r[0].id).toBe('fsb-eggplant');
  });
  test('sudden poultry deaths surface a reportable disease', () => {
    const r = diagnoseOffline('manok na may twisted neck at biglang namatay, greenish diarrhea', 'animal', 'native_chicken');
    expect(r[0].id).toBe('newcastle');
    expect(r[0].reportable).toBe(true);
    expect(r[0].seeExpert).toBe(true);
  });
  test('fish gasping at the surface at dawn -> oxygen problem with a practical first step', () => {
    const r = diagnoseOffline('tilapia gasping at the surface early morning, green water', 'fish', 'tilapia');
    expect(r[0].id).toBe('low-do');
    expect(r[0].actions.join(' ').toLowerCase()).toContain('aerat');
  });
  test('results are limited to the chosen kind and sorted', () => {
    const r = diagnoseOffline('white spots and sores', 'fish');
    expect(r.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].confidence).toBeGreaterThanOrEqual(r[i].confidence);
  });
  test('gibberish and empty input give no diagnosis rather than a guess', () => {
    expect(diagnoseOffline('', 'plant')).toEqual([]);
    expect(diagnoseOffline('zxqv blorp', 'plant')).toEqual([]);
  });
  test('no treatment advice contains drug doses', () => {
    const all = diagnoseOffline('bloody droppings weak huddling wet litter', 'animal', 'native_chicken');
    for (const r of all) for (const a of r.actions) expect(a).not.toMatch(/\b\d+\s?(mg|ml|g\/l|ppm)\b/i);
  });
});

describe('static data', () => {
  test('places include the default and search works', () => {
    expect(PLACES.length).toBeGreaterThan(60);
    expect(DEFAULT_PLACE.province).toBe('Nueva Ecija');
    expect(searchPlaces('davao').some((p) => p.name === 'Davao City')).toBe(true);
    for (const p of PLACES) { expect(p.lat).toBeGreaterThan(4); expect(p.lat).toBeLessThan(21); expect(p.lon).toBeGreaterThan(115); expect(p.lon).toBeLessThan(128); }
  });
  test('permit ids are unique and every sector has a checklist', () => {
    expect(new Set(PERMITS.map((p) => p.id)).size).toBe(PERMITS.length);
    for (const s of ['agriculture', 'aquaculture', 'livestock', 'processing'] as const) expect(permitsFor(s).length).toBeGreaterThan(5);
  });
  test('catalog ids are unique and every item is profitable per cycle on paper', () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
    for (const c of CATALOG) {
      const revenue = c.yieldKgPerSqm * c.farmGatePerKg;
      const cost = c.opCostPerSqmMonth * (c.cycleDays / 30);
      expect(revenue).toBeGreaterThan(cost);
    }
  });
});

describe('router', () => {
  test('matches params', () => {
    expect(matchRoute('/plan/:id', '/plan/abc')).toEqual({ id: 'abc' });
    expect(matchRoute('/plan/:id', '/plan')).toBeNull();
    expect(matchRoute('/', '/')).toEqual({});
    expect(matchRoute('/a/b', '/a/c')).toBeNull();
  });
});
