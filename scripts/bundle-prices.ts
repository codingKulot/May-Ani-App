// Reads a DA Bantay Presyo PDF and writes it as the price list bundled with the app (src/data/ncrPrices.json), the copy phones
// use when the server's daily list cannot be reached. Run after downloading a newer PDF:
//   bun scripts/bundle-prices.ts path/to/Price-Monitoring-October-20-2026.pdf https://www.da.gov.ph/wp-content/uploads/...pdf
import { writeFileSync } from 'node:fs';
import { parseBantayPresyo } from '../server/prices.mjs';

const [file, url = ''] = process.argv.slice(2);
if (!file) {
  console.error('Usage: bun scripts/bundle-prices.ts <pdf> [url it came from]');
  process.exit(1);
}
const list = await parseBantayPresyo(await Bun.file(file).arrayBuffer());
const out = new URL('../src/data/ncrPrices.json', import.meta.url);
writeFileSync(out, `${JSON.stringify({ asOf: list.asOf, url, area: list.area, markets: list.markets })}\n`);
console.log(`Wrote the list of ${list.asOf}: ${list.markets.length} markets, ${list.area.reduce((n, g) => n + g.rows.length, 0)} Metro Manila items.`);
