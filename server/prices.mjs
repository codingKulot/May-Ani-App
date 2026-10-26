// DA Bantay Presyo: the Department of Agriculture's daily retail price list for Metro Manila (a PDF, weekdays), read by the server
// so the app shows prices from DA's latest working day without anyone copying them by hand.
//   PDF pages 1-3: one prevailing price per market for 34 named NCR markets and about 28 items ("NOT AVAILABLE" = not sold that day).
//   PDF pages 4-6: Low, High, Prevailing and Average across those markets for about 100 items (rice, meat, eggs, fish, vegetables, fruits...).
// The answer of GET /api/prices/ncr has the same shape as the app's bundled bulletins (src/data/priceWatch.ts).
// The PDF reader (unpdf) is loaded only when a list is read. Nothing here is live: every list says the day DA checked it.

export const DA_BASE_URL = 'https://www.da.gov.ph';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Where DA puts the list of one day (ISO date), e.g. .../2026/10/Price-Monitoring-October-20-2026.pdf */
export function bantayPresyoUrl(isoDay, base = DA_BASE_URL) {
  const [y, m, d] = isoDay.split('-').map(Number);
  return `${base}/wp-content/uploads/${y}/${String(m).padStart(2, '0')}/Price-Monitoring-${MONTHS[m - 1]}-${d}-${y}.pdf`;
}

/** Today in the Philippines (UTC+8, no daylight saving), as yyyy-mm-dd. */
export function manilaDay(now = Date.now()) {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

const addDay = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------------------------------------ reading the PDF

const NUM = /^(\d{1,3}(,\d{3})*|\d+)(\.\d+)?\**$/;
const toNum = (s) => Number(s.replace(/[,*]/g, ''));
const clean = (s) => s.replace(/[ᵃᵇᶜ]/g, '').replace(/\s+/g, ' ').trim();

/** The text pieces of one page with their positions: { s, x (left), cx (centre), y }. */
async function pageItems(pdf, n) {
  const page = await pdf.getPage(n);
  const tc = await page.getTextContent();
  return tc.items
    .filter((it) => typeof it.str === 'string' && it.str.trim())
    .map((it) => ({ s: it.str.trim(), x: it.transform[4], cx: it.transform[4] + (it.width || 0) / 2, y: it.transform[5] }));
}

/** Pieces whose y is within `tol` of each other form one line, top line first. */
function lines(items, tol = 2.5) {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const out = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - it.y) <= tol) last.items.push(it);
    else out.push({ y: it.y, items: [it] });
  }
  for (const l of out) l.items.sort((a, b) => a.x - b.x);
  return out;
}

/** The date printed on a page, e.g. "Tuesday, October 20, 2026" -> "2026-10-20". */
function pageDate(items) {
  for (const { s } of items) {
    const m = s.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/);
    if (m) return `${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return '';
}

/** A per-market page: columns of items, one line per market. Answers { items: [label], markets: [{ name, prices: [n|null] }] }. */
function readMarketPage(items) {
  const header = items.find((it) => /^MARKET$/.test(it.s));
  if (!header) return null;
  const firstValueX = Math.min(...items.filter((it) => NUM.test(it.s) || /^NOT AVAILABLE$/i.test(it.s)).map((it) => it.x));
  // header pieces: between the "COMMODITY" line and the first market line, right of the market names
  const top = items.find((it) => /^COMMODITY/.test(it.s));
  const head = items.filter((it) => it.y < (top ? top.y - 1 : header.y + 20) && it.y > header.y - 20 && it.x >= firstValueX - 20 && !/^COMMODITY/.test(it.s));
  const cols = [];
  for (const it of [...head].sort((a, b) => b.y - a.y)) {
    const c = cols.find((k) => Math.abs(k.cx - it.cx) < 25);
    if (c) c.label = `${c.label} ${it.s}`;
    else cols.push({ cx: it.cx, label: it.s });
  }
  cols.sort((a, b) => a.cx - b.cx);
  const body = items.filter((it) => it.y < header.y - 12);
  const markets = [];
  for (const l of lines(body)) {
    const nameParts = l.items.filter((it) => it.x < firstValueX - 10 && !NUM.test(it.s));
    const values = l.items.filter((it) => it.x >= firstValueX - 20 && (NUM.test(it.s) || /^NOT AVAILABLE$/i.test(it.s)));
    if (!nameParts.length || values.length < cols.length / 2) continue; // notes and legends under the table
    const prices = cols.map(() => null);
    for (const v of values) {
      const i = cols.reduce((best, c, k) => (Math.abs(c.cx - v.cx) < Math.abs(cols[best].cx - v.cx) ? k : best), 0);
      prices[i] = NUM.test(v.s) ? toNum(v.s) : null;
    }
    markets.push({ name: clean(nameParts.map((p) => p.s).join('')), prices });
  }
  return { items: cols.map((c) => clean(c.label.replace(/^\*/, ''))), markets };
}

/** An all-NCR page: labels with Low, High, Prevailing, Average to their right. Answers [[label, low, high, prevailing]]. */
function readAreaPage(items) {
  const labels = items.filter((it) => !NUM.test(it.s) && it.s !== '-' && !/^(COMMODITIES|LOW|HIGH|PREVA[I]?LING|AVERAGE)$/i.test(it.s)
    && /[a-z]/.test(it.s) && it.s.length > 2); // item names have small letters (headings like RICE do not); footnote marks are 1 letter
  const numbers = items.filter((it) => NUM.test(it.s));
  const rows = [];
  for (const lab of labels) {
    // numbers on the same line, right of this label and left of the next label on that line
    const nextX = Math.min(...labels.filter((o) => o !== lab && Math.abs(o.y - lab.y) <= 3 && o.x > lab.x).map((o) => o.x), Infinity);
    const nums = numbers.filter((n) => Math.abs(n.y - lab.y) <= 3 && n.x > lab.x && n.x < nextX).sort((a, b) => a.x - b.x);
    if (nums.length < 3) continue;
    const v = nums.map((n) => toNum(n.s));
    const [low, high, prevailing] = v.length >= 4 ? v : [v[0], v[0], v[1]]; // "20.00 | 20.00 | 20.00" (low = high in one box)
    rows.push({ y: lab.y, x: lab.x, label: clean(lab.s), row: [clean(lab.s), low, high, prevailing] });
  }
  // a heading in capitals right above a rice row says which kind it is (IMPORTED / LOCAL COMMERCIAL RICE)
  const kinds = items.filter((it) => /COMMERCIAL RICE|RICE-FOR-ALL/.test(it.s));
  for (const r of rows) {
    const k = kinds.filter((h) => h.y > r.y && Math.abs(h.x - r.x) < 15).sort((a, b) => a.y - b.y)[0];
    if (k && /^(Basmati|Glutinous|Jasponica|Japonica|Other Special|Premium|Well Milled|Regular Milled|P20)/i.test(r.label)) {
      const kind = /IMPORTED/.test(k.s) ? 'Imported rice' : /LOCAL/.test(k.s) ? 'Local rice' : 'Kadiwa rice';
      r.row[0] = `${kind}, ${r.label.replace(/^Jasponica\/Japonica$/, 'Japonica')}`;
    }
  }
  return rows.map((r) => r.row);
}

/** Which group an item belongs to (the same groups as the bundled DA Davao bulletins). */
export function itemGroup(label) {
  const s = label.toLowerCase();
  if (/rice|bigas|milled/.test(s)) return 'Rice';
  if (/corn/.test(s)) return 'Corn products';
  if (/mung/.test(s)) return 'Legumes';
  if (/beef|pork|kasim|liempo|chicken|\begg\b|carabeef/.test(s)) return 'Livestock and poultry';
  if (/alumahan|bangus|milkfish|galunggong|scad|tamban|sardine|squid|pusit|tilapia|tuna|tulingan|bonito|matambaka|pampano/.test(s)) return 'Fish';
  if (/avocado|banana|calamansi|mango|melon|papaya|pomelo|watermelon|pineapple|lanzones|rambutan/.test(s)) return 'Fruits';
  if (/sugar|oil|salt/.test(s)) return 'Other basic goods';
  if (/garlic|ginger|onion|labuyo|red chili/.test(s)) return 'Spices';
  if (/bell pepper|cabbage|carrot|celery|chayote|baguio|habichuelas|lettuce|potato|cauliflower|broccoli/.test(s)) return 'Highland vegetables';
  return 'Lowland vegetables';
}

const GROUP_ORDER = ['Rice', 'Corn products', 'Legumes', 'Livestock and poultry', 'Fish', 'Lowland vegetables', 'Highland vegetables', 'Fruits', 'Spices', 'Other basic goods'];

function grouped(rows) {
  const by = new Map();
  for (const r of rows) {
    const g = itemGroup(r[0]);
    if (!by.has(g)) by.set(g, []);
    if (!by.get(g).some((x) => x[0] === r[0])) by.get(g).push(r);
  }
  return GROUP_ORDER.filter((g) => by.has(g)).map((name) => ({ name, rows: by.get(name) }));
}

/** The per-market item names as the app shows them ("Fresh Pork Liempo (Local)" stays; "*Egg (Medium)" becomes per piece). */
const marketLabel = (s) => s.replace(/^Egg \(Medium\)$/i, 'Chicken Egg (Medium)');

/**
 * Reads one Bantay Presyo PDF (bytes). Answers { asOf, area: [group], markets: [{ name, groups }] } or throws when it is not one.
 * Rows are [label, low, high, prevailing]; a single market's row has low = high = prevailing (DA gives one price per market).
 */
export async function parseBantayPresyo(bytes) {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  let asOf = '';
  const perMarket = new Map(); // market name -> rows
  const areaRows = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const items = await pageItems(pdf, n);
    asOf ||= pageDate(items);
    const mp = readMarketPage(items);
    if (mp) {
      for (const m of mp.markets) {
        if (!perMarket.has(m.name)) perMarket.set(m.name, []);
        mp.items.forEach((label, i) => {
          const p = m.prices[i];
          if (p != null && p > 0) perMarket.get(m.name).push([marketLabel(label), p, p, p]);
        });
      }
    } else {
      areaRows.push(...readAreaPage(items));
    }
  }
  const good = areaRows.filter(([, lo, hi, pr]) => lo > 0 && lo <= pr && pr <= hi);
  if (!asOf || perMarket.size < 10 || good.length < 30) throw new Error('This does not look like a DA Bantay Presyo price list.');
  return {
    asOf,
    area: grouped(good),
    markets: [...perMarket].map(([name, rows]) => ({ name, groups: grouped(rows) })),
  };
}

// ------------------------------------------------------------------------------------------------ keeping the latest list

const COLLECTION = 'price_lists';
const LIST_ID = 'bantay-presyo-ncr';

/**
 * Keeps DA's latest Metro Manila list: looks for a newer one at start and every `everyMs` (DA posts on working days), stores it in
 * MongoDB when there is one (all server copies share it) and in memory. `fetchImpl` and `base` are for tests.
 */
export function priceLists({ database = null, log, base = DA_BASE_URL, everyMs = 3 * 3600_000, retryMs = 15 * 60_000, lookBackDays = 7, timeoutMs = 120_000, tries = 8, fetchImpl = fetch, now = () => Date.now() } = {}) {
  let latest = null; // { asOf, fetchedAt, url, area, markets }
  let timer = null;
  let running = null;
  let failed = false; // the last check could not download a list
  let stopped = true;

  async function load() {
    if (latest || !database) return latest;
    try {
      const doc = await database.collection(COLLECTION).findOne({ _id: LIST_ID });
      if (doc?.data) latest = doc.data;
    } catch (e) { log?.warn?.(`Prices: could not read the saved list (${e.message}).`); }
    return latest;
  }

  /**
   * Downloads one PDF. DA's website is very slow (a 2 MB list can take several minutes and often stalls), so each try gets
   * `timeoutMs` and the next try asks only for the bytes still missing (an HTTP Range request), up to `tries` times.
   * Answers the bytes, or null when there is no list that day.
   */
  async function download(url) {
    const parts = [];
    let got = 0;
    let total = 0;
    for (let attempt = 1; attempt <= tries; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const headers = { 'User-Agent': 'May-Ani price reader', ...(got ? { Range: `bytes=${got}-` } : {}) };
        const res = await fetchImpl(url, { signal: ctrl.signal, headers });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`DA answered ${res.status}`);
        const type = res.headers.get('content-type') || '';
        if (type && !/pdf|octet-stream/i.test(type)) return null; // a "page not found" page served as 200
        if (got && res.status !== 206) { parts.length = 0; got = 0; } // the server sent the whole file again
        const range = res.headers.get('content-range')?.match(/\/(\d+)$/);
        total = range ? Number(range[1]) : got + Number(res.headers.get('content-length') || 0);
        if (!res.body) { const b = Buffer.from(await res.arrayBuffer()); parts.push(b); got += b.length; } else {
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            parts.push(Buffer.from(value));
            got += value.length;
          }
        }
        if (!total || got >= total) return Buffer.concat(parts);
      } catch (e) {
        if (attempt === tries) throw new Error(`${e.name === 'AbortError' ? 'too slow' : e.message}, ${got} of ${total || '?'} bytes after ${tries} tries`);
      } finally { clearTimeout(t); }
    }
    return Buffer.concat(parts);
  }

  /** Looks for lists newer than the one kept, newest day first. Answers true when a newer one was saved. */
  async function refresh() {
    if (running) return running;
    failed = false;
    running = (async () => {
      await load();
      const today = manilaDay(now());
      for (let i = 0; i <= lookBackDays; i++) {
        const day = addDay(today, -i);
        if (latest && day <= latest.asOf) break; // nothing newer than what we have
        const url = bantayPresyoUrl(day, base);
        let bytes;
        try { bytes = await download(url); } catch (e) {
          failed = true;
          log?.warn?.(`Prices: ${url} could not be downloaded (${e.message}); trying again in ${Math.round(retryMs / 60_000)} minutes.`);
          return false;
        }
        if (!bytes) continue; // no list that day (weekend, holiday, not posted yet)
        try {
          const list = await parseBantayPresyo(bytes);
          latest = { ...list, url, fetchedAt: new Date(now()).toISOString() };
          if (database) await database.collection(COLLECTION).replaceOne({ _id: LIST_ID }, { _id: LIST_ID, data: latest }, { upsert: true });
          log?.info?.(`Prices: DA Bantay Presyo list of ${list.asOf} read (${list.markets.length} markets).`);
          return true;
        } catch (e) {
          log?.warn?.(`Prices: ${url} could not be read (${e.message}).`);
          return false;
        }
      }
      return false;
    })().finally(() => { running = null; });
    return running;
  }

  return {
    load,
    refresh,
    latest: () => latest,
    /** Checks now, then every `everyMs`; after a failed download (DA's site is slow and often stalls) again after `retryMs`. */
    start() {
      stopped = false;
      const tick = () => refresh().catch(() => {}).finally(() => {
        if (stopped) return;
        timer = setTimeout(tick, failed ? retryMs : everyMs);
        timer.unref?.();
      });
      tick();
    },
    stop() { stopped = true; if (timer) clearTimeout(timer); timer = null; },
  };
}

/** GET /api/prices/ncr: the latest list, or 503 `prices_none` while the server has none yet. Public: DA's prices are public data. */
export function priceRoutes(lists, { json }) {
  return {
    'GET /api/prices/ncr': async (_req, res) => {
      const l = (await lists.load()) || lists.latest();
      if (!l) return json(res, 503, { error: 'No DA price list has been read yet.', code: 'prices_none' });
      res.setHeader('Cache-Control', 'public, max-age=600');
      json(res, 200, { asOf: l.asOf, fetchedAt: l.fetchedAt, url: l.url, area: l.area, markets: l.markets });
    },
  };
}
