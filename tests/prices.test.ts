// DA Bantay Presyo: reading DA's daily Metro Manila PDF (server/prices.mjs) and keeping the newest list. Uses the real list of
// 20 October 2026 (tests/fixtures) and a fake DA website, so it never downloads from da.gov.ph.
import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { bantayPresyoUrl, itemGroup, manilaDay, parseBantayPresyo, priceLists, priceRoutes } from '../server/prices.mjs';
import ncrPrices from '../src/data/ncrPrices.json';

const PDF = readFileSync(new URL('./fixtures/bantay-presyo-2026-10-20.pdf', import.meta.url));
let list: Awaited<ReturnType<typeof parseBantayPresyo>>;

beforeAll(async () => { list = await parseBantayPresyo(PDF); });

const row = (groups: { rows: [string, number, number, number][] }[], label: string) => groups.flatMap((g) => g.rows).find((r) => r[0] === label);
const market = (name: string) => list.markets.find((m: any) => m.name === name)!;

describe('reading the PDF', () => {
  test('date, all 34 markets, and the Metro Manila list in every category', () => {
    expect(list.asOf).toBe('2026-10-20');
    expect(list.markets.length).toBe(34);
    expect(list.area.map((g: any) => g.name)).toEqual(['Rice', 'Corn products', 'Legumes', 'Livestock and poultry', 'Fish', 'Lowland vegetables', 'Highland vegetables', 'Fruits', 'Spices', 'Other basic goods']);
  });

  // values checked by eye against the PDF pages
  test('one price per product at each market, "NOT AVAILABLE" left out', () => {
    expect(row(market('Agora Public Market/San Juan').groups, 'Bangus')).toEqual(['Bangus', 240, 240, 240]);
    expect(row(market('Agora Public Market/San Juan').groups, 'Fresh Whole Chicken')).toEqual(['Fresh Whole Chicken', 200, 200, 200]);
    expect(row(market('Balintawak (Cloverleaf) Market').groups, 'Galunggong (Local)')).toBeUndefined(); // NOT AVAILABLE
    expect(row(market('Balintawak (Cloverleaf) Market').groups, 'White Onion (Local)')![3]).toBe(150);
    expect(row(market('Trabajo Market').groups, 'Fresh Pork Liempo (Local)')![3]).toBe(440);
    expect(row(market('San Andres Market/Manila').groups, 'Fresh Whole Chicken')).toBeUndefined();
    expect(row(market('Guadalupe Public Market/Makati').groups, 'Chicken Egg (Medium)')![3]).toBe(7.5);
  });

  test('Metro Manila Low to High, with the rice kinds and footnote marks sorted out', () => {
    expect(row(list.area, 'Imported rice, Basmati')).toEqual(['Imported rice, Basmati', 150, 250, 170]);
    expect(row(list.area, 'Local rice, Regular Milled')).toEqual(['Local rice, Regular Milled', 38, 54, 45]);
    expect(row(list.area, 'Pork Belly')).toEqual(['Pork Belly', 260, 420, 370]); // "420.00*"
    expect(row(list.area, 'Avocado')).toEqual(['Avocado', 180, 680, 400]);
    expect(row(list.area, 'Milkfish (Bangus)')).toEqual(['Milkfish (Bangus)', 160, 280, 260]);
    expect(row(list.area, 'Coconut Oil - 1L')).toEqual(['Coconut Oil - 1L', 114, 170, 160]);
    expect(list.area.flatMap((g: any) => g.rows).some((r: any) => r[0].length < 3)).toBe(false); // no stray footnote letters
  });

  test('every Metro Manila row reads low <= prevailing <= high', () => {
    for (const [label, lo, hi, pr] of list.area.flatMap((g: any) => g.rows)) expect(lo <= pr && pr <= hi ? '' : label).toBe('');
  });

  test('the copy bundled with the app is this list', () => {
    expect(ncrPrices.asOf).toBe(list.asOf);
    expect(ncrPrices.area).toEqual(list.area);
    expect(ncrPrices.markets).toEqual(list.markets);
  });

  test('something that is not a Bantay Presyo list is refused', async () => {
    await expect(parseBantayPresyo(new TextEncoder().encode('not a pdf'))).rejects.toThrow();
  });

  test('groups', () => {
    expect(itemGroup('Eggplant')).toBe('Lowland vegetables');
    expect(itemGroup('Chicken Egg (Medium)')).toBe('Livestock and poultry');
    expect(itemGroup('Regular Milled (Local)')).toBe('Rice');
    expect(itemGroup('Red Chili (Local)')).toBe('Spices');
    expect(itemGroup('Calamansi')).toBe('Fruits');
  });
});

describe('finding the newest list', () => {
  test('DA file names and the Philippine day', () => {
    expect(bantayPresyoUrl('2026-10-20')).toBe('https://www.da.gov.ph/wp-content/uploads/2026/10/Price-Monitoring-October-20-2026.pdf');
    expect(bantayPresyoUrl('2026-01-05', 'http://x')).toBe('http://x/wp-content/uploads/2026/01/Price-Monitoring-January-5-2026.pdf');
    expect(manilaDay(Date.parse('2026-10-20T17:00:00Z'))).toBe('2026-10-21'); // 1 am in Manila
  });

  /** A fake DA website: the PDF for the days in `days`, a "page not found" HTML page (200) for `html`, 404 for the rest. */
  function fakeDa(days: string[], html: string[] = []) {
    const asked: string[] = [];
    const fetchImpl = async (url: string) => {
      asked.push(url);
      if (days.some((d) => url === bantayPresyoUrl(d, 'http://da'))) return new Response(new Blob([PDF as BlobPart]), { headers: { 'content-type': 'application/pdf' } });
      if (html.some((d) => url === bantayPresyoUrl(d, 'http://da'))) return new Response('<html>not found</html>', { headers: { 'content-type': 'text/html' } });
      return new Response('', { status: 404 });
    };
    return { asked, fetchImpl: fetchImpl as unknown as typeof fetch };
  }
  const quiet = { info() {}, warn() {}, error() {} };
  const at = (iso: string) => () => Date.parse(`${iso}T02:00:00Z`); // 10 am in Manila

  test('looks back day by day (weekends, a page-not-found page) until it finds a list, then keeps it', async () => {
    const da = fakeDa(['2026-10-20'], ['2026-10-22']);
    const lists = priceLists({ base: 'http://da', fetchImpl: da.fetchImpl, now: at('2026-10-23'), log: quiet });
    expect(await lists.refresh()).toBe(true);
    expect(lists.latest()!.asOf).toBe('2026-10-20');
    expect(lists.latest()!.markets.length).toBe(34);
    expect(da.asked.length).toBe(4); // 23 (404), 22 (HTML), 21 (404), 20 (found)
    // the next check stops at the day it already has
    da.asked.length = 0;
    expect(await lists.refresh()).toBe(false);
    expect(da.asked.length).toBe(3);
  });

  test('a DA site that does not answer keeps the old list and tries again later', async () => {
    const lists = priceLists({ base: 'http://da', fetchImpl: (async () => { throw new Error('timeout'); }) as unknown as typeof fetch, now: at('2026-10-23'), log: quiet });
    expect(await lists.refresh()).toBe(false);
    expect(lists.latest()).toBeNull();
  });

  test('GET /api/prices/ncr: 503 before a list is read, then the list', async () => {
    const da = fakeDa(['2026-10-20']);
    const lists = priceLists({ base: 'http://da', fetchImpl: da.fetchImpl, now: at('2026-10-20'), log: quiet });
    const out: { status?: number; body?: any } = {};
    const json = (_res: unknown, status: number, body: unknown) => { out.status = status; out.body = body; };
    const route = priceRoutes(lists, { json })['GET /api/prices/ncr'];
    const res = { setHeader() {} };
    await route({}, res);
    expect(out.status).toBe(503);
    expect(out.body.code).toBe('prices_none');
    await lists.refresh();
    await route({}, res);
    expect(out.status).toBe(200);
    expect(out.body.asOf).toBe('2026-10-20');
    expect(out.body.url).toBe(bantayPresyoUrl('2026-10-20', 'http://da'));
    expect(out.body.markets.length).toBe(34);
  });
});

describe('downloading from a slow DA website', () => {
  const quiet = { info() {}, warn() {}, error() {} };
  const at = () => Date.parse('2026-10-20T02:00:00Z');
  const url = bantayPresyoUrl('2026-10-20', 'http://da');

  test('a download that stalls halfway goes on from where it stopped (Range request)', async () => {
    const ranges: (string | null)[] = [];
    const half = Math.floor(PDF.length / 2);
    const fetchImpl = (async (u: string, init: { headers: Record<string, string> }) => {
      if (u !== url) return new Response('', { status: 404 });
      const range = init.headers.Range ?? null;
      ranges.push(range);
      if (!range) {
        // the first try sends half of the file, then the connection breaks
        let sent = false;
        const body = new ReadableStream({
          pull(c) { if (sent) c.error(new Error('connection reset')); else { sent = true; c.enqueue(PDF.slice(0, half)); } },
        });
        return new Response(body, { headers: { 'content-type': 'application/pdf', 'content-length': String(PDF.length) } });
      }
      const from = Number(range.match(/bytes=(\d+)-/)![1]);
      return new Response(new Blob([PDF.slice(from) as BlobPart]), {
        status: 206, headers: { 'content-type': 'application/pdf', 'content-range': `bytes ${from}-${PDF.length - 1}/${PDF.length}` },
      });
    }) as unknown as typeof fetch;
    const lists = priceLists({ base: 'http://da', fetchImpl, now: at, log: quiet, lookBackDays: 0 });
    expect(await lists.refresh()).toBe(true);
    expect(ranges).toEqual([null, `bytes=${half}-`]);
    expect(lists.latest()!.markets.length).toBe(34);
  });

  test('gives up after the last try and says how far it got', async () => {
    const warnings: string[] = [];
    const fetchImpl = (async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }) as unknown as typeof fetch;
    const lists = priceLists({ base: 'http://da', fetchImpl, now: at, tries: 3, lookBackDays: 0, log: { ...quiet, warn: (m: string) => warnings.push(m) } });
    expect(await lists.refresh()).toBe(false);
    expect(warnings[0]).toContain('too slow, 0 of ? bytes after 3 tries');
    expect(warnings[0]).toContain('trying again in 15 minutes');
  });
});
