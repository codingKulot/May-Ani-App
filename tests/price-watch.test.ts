import { describe, expect, test } from 'bun:test';
import { BANTAY_PRESYO_NCR, WATCH_BULLETINS, WATCH_MARKETS } from '@/data/priceWatch';
import { PLACES } from '@/data/places';
import { catalogById } from '@/data/catalog';
import { TOP_MARKETS, ageLabel, bulletinAgeDays, groupCategory, itemRange, latestBulletin, nearbyArea, nearbyMarkets, rangeText, rowUnit, topMarkets, watchData } from '@/services/priceWatch';

const place = (name: string) => PLACES.find((p) => p.name === name)!;

describe('DA Price Watch data', () => {
  test('every bulletin belongs to a known market and has a real date and a source link', () => {
    for (const b of WATCH_BULLETINS) {
      expect(WATCH_MARKETS.some((m) => m.id === b.market)).toBe(true);
      expect(b.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(`${b.asOf}T00:00:00`).getTime())).toBe(false);
      expect(b.sourceUrl).toMatch(/^https:\/\//);
    }
    for (const m of WATCH_MARKETS) expect(latestBulletin(m.id)).toBeDefined();
  });

  // catches most copying mistakes: a typed digit too many or a column shifted
  test('every row reads low <= most common <= high, all prices positive and plausible', () => {
    const bad: string[] = [];
    // one market: low and high are close; across all 34 Metro Manila markets the spread is wider
    for (const b of WATCH_BULLETINS) {
      const spread = b.market === 'ncr' ? 6 : 2.5;
      for (const g of b.groups) {
        expect(g.rows.length).toBeGreaterThan(0);
        for (const [label, low, high, prevailing] of g.rows) {
          const where = `${b.market} ${label}`;
          if (!(low > 0 && low <= prevailing && prevailing <= high && high < 1000 && high / low < spread)) bad.push(where);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('no product appears twice in one bulletin', () => {
    for (const b of WATCH_BULLETINS) {
      const labels = b.groups.flatMap((g) => g.rows.map((r) => r[0]));
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe('nearest DA market', () => {
  test('Davao City gets Bankerohan first, then the other markets within reach', () => {
    const near = nearbyMarkets(place('Davao City'));
    expect(near[0].market.id).toBe('bankerohan');
    expect(near[0].km).toBeLessThan(30); // the app places "Davao City" at the middle of its large land area
    expect(near.map((m) => m.market.id)).toContain('digos');
    for (let i = 1; i < near.length; i++) expect(near[i].km).toBeGreaterThanOrEqual(near[i - 1].km);
  });

  test('Tagum gets its own market first', () => {
    expect(nearbyMarkets(place('Tagum'))[0].market.id).toBe('tagum');
  });

  test('Quezon City gets its 3 nearest Bantay Presyo markets, plus the all-Metro Manila list', () => {
    const d = watchData();
    const top = topMarkets(place('Quezon City'), d.markets, d.bulletins);
    expect(top.length).toBe(3);
    expect(top.every((m) => m.market.id.startsWith('ncr-') && !m.market.area && m.km < 8)).toBe(true);
    expect(nearbyArea(place('Quezon City'), d.markets, d.bulletins)!.market.id).toBe('ncr');
    // Laguna: Metro Manila markets are within reach too
    expect(topMarkets({ lat: 14.28, lon: 121.41 }, d.markets, d.bulletins).length).toBe(3);
  });

  test('a single Metro Manila market has one price per product, and its date and source', () => {
    const d = watchData();
    const agora = latestBulletin('ncr-agorapublicmarket', d.bulletins)!;
    expect(agora.asOf).toBe('2026-10-20');
    expect(itemRange('bangus', agora)).toEqual({ label: 'Bangus', low: 240, high: 240, prevailing: 240 });
    expect(itemRange('broiler', agora)!.prevailing).toBe(200);
    expect(itemRange('rice', agora)!.prevailing).toBe(38);
  });

  test('a place far from every DA-checked market gets none (no far-away prices passed off as local)', () => {
    expect(nearbyMarkets({ lat: 16.41, lon: 120.6 })).toEqual([]); // Baguio
  });

  test('the newest bulletin of a market wins', () => {
    const b = WATCH_BULLETINS[0];
    const newer = { ...b, asOf: '2099-01-01' };
    expect(latestBulletin(b.market, [b, newer])!.asOf).toBe('2099-01-01');
  });
});

describe('prices for catalog items', () => {
  const bankerohan = latestBulletin('bankerohan')!;

  test('maps catalog items to the matching DA row', () => {
    expect(itemRange('ampalaya', bankerohan)).toEqual({ label: 'Ampalaya', low: 90, high: 100, prevailing: 100 });
    expect(itemRange('talong', bankerohan)!.label).toBe('Eggplant');
    expect(itemRange('bangus', bankerohan)!.label).toBe('Bangus, Medium');
    expect(itemRange('sili', bankerohan)!.label).toBe('Chili (Red, Local)');
    expect(itemRange('sili', latestBulletin('digos')!)!.label).toBe('Chilli (Red), Local');
    expect(itemRange('mango', latestBulletin('tagum')!)!.label).toBe('Mango (Cebu)');
  });

  test('items DA does not check, or checks as something else, get no range', () => {
    expect(itemRange('lettuce', latestBulletin('digos')!)).toBeNull(); // iceberg, not leaf lettuce
    expect(itemRange('kangkong', bankerohan)).toBeNull();
    expect(itemRange('corn', bankerohan)).toBeNull(); // Bankerohan had no yellow corn that day
    expect(itemRange('not_an_item', bankerohan)).toBeNull();
  });

  test('every mapped item exists in the catalog', () => {
    for (const id of ['ampalaya', 'talong', 'kamatis', 'sitaw', 'pechay', 'sili', 'corn', 'rice', 'tilapia', 'bangus', 'broiler', 'banana', 'mango', 'papaya', 'calamansi', 'watermelon']) {
      expect(catalogById(id) ? id : `missing ${id}`).toBe(id);
    }
  });
});

describe('labels', () => {
  test('age of a bulletin', () => {
    expect(bulletinAgeDays({ asOf: '2026-05-25' }, '2026-10-21')).toBe(149);
    expect(bulletinAgeDays({ asOf: '2026-10-22' }, '2026-10-21')).toBe(0);
    expect(ageLabel(0)).toBe('from today');
    expect(ageLabel(1)).toBe('1 day old');
    expect(ageLabel(13)).toBe('13 days old');
    expect(ageLabel(149)).toBe('about 5 months old');
    expect(ageLabel(400)).toBe('more than a year old');
  });

  test('ranges and units', () => {
    expect(rangeText(90, 100)).toBe('₱90–₱100');
    expect(rangeText(200, 200)).toBe('₱200');
    expect(rangeText(8, 8.75)).toBe('₱8–₱8.75');
    expect(rangeText(1500, 2000)).toBe('₱1,500–₱2,000');
    expect(rowUnit('Chicken Egg (White, Large)')).toBe('piece');
    expect(rowUnit('Cooking Oil (Palm)')).toBe('');
    expect(rowUnit('Tilapia')).toBe('kg');
  });
});

describe('top 3 markets and the Bantay Presyo fallback', () => {
  test('at most 3 markets, nearest first', () => {
    const top = topMarkets(place('Davao City'));
    expect(top.length).toBe(TOP_MARKETS);
    expect(top.map((m) => m.market.id)).toEqual(nearbyMarkets(place('Davao City')).slice(0, 3).map((m) => m.market.id));
  });

  test('a location with no DA-checked market near gets none, so the page shows the Metro Manila list instead', () => {
    expect(topMarkets({ lat: 10.31, lon: 123.89 })).toEqual([]); // Cebu City
  });

  test('the Metro Manila list covers all four farm types and is dated', () => {
    const cats = new Set(BANTAY_PRESYO_NCR.groups.map((g) => groupCategory(g.name)));
    for (const c of ['crops', 'fruits', 'fish', 'livestock'] as const) expect(cats.has(c)).toBe(true);
    expect(BANTAY_PRESYO_NCR.asOf).toBe('2026-10-20');
    expect(BANTAY_PRESYO_NCR.sourceUrl).toMatch(/^https:\/\/www\.da\.gov\.ph\//);
  });

  test('DA groups fall into the app categories', () => {
    expect(groupCategory('Lowland vegetables')).toBe('crops');
    expect(groupCategory('Rice')).toBe('crops');
    expect(groupCategory('Spices')).toBe('crops');
    expect(groupCategory('Fruits')).toBe('fruits');
    expect(groupCategory('Fish')).toBe('fish');
    expect(groupCategory('Livestock and poultry')).toBe('livestock');
    expect(groupCategory('Other basic goods')).toBe('other');
  });

  test('catalog items find their Metro Manila row too', () => {
    expect(itemRange('ampalaya', BANTAY_PRESYO_NCR)).toEqual({ label: 'Bittergourd (Ampalaya)', low: 50, high: 180, prevailing: 120 });
    expect(itemRange('bangus', BANTAY_PRESYO_NCR)!.label).toBe('Milkfish (Bangus)');
    expect(itemRange('broiler', BANTAY_PRESYO_NCR)!.label).toBe('Whole Chicken');
    expect(itemRange('sili', BANTAY_PRESYO_NCR)!.label).toBe('ChilI (Siling labuyo)'); // DA's own spelling
    expect(itemRange('pechay', BANTAY_PRESYO_NCR)!.label).toBe('Pechay Tagalog');
  });

  test('oil is priced per bottle', () => {
    expect(rowUnit('Palm Oil, 1 L')).toBe('');
    expect(rowUnit('Coconut Oil, 350 ml')).toBe('');
  });
});
