// Production build: bundles index.html (+ TSX, CSS) with Bun and copies /public.
import { cp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

await rm('dist', { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: ['./index.html'],
  outdir: './dist',
  minify: true,
  sourcemap: 'linked',
  // Marks this as the real app: React's smaller, faster production build, and the offline service worker in src/main.tsx.
  define: { 'process.env.NODE_ENV': '"production"' },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
await cp('public', 'dist', { recursive: true });

// PWA tags live here (not in index.html) because Bun's HTML bundler would try to resolve them as source files.
const html = await Bun.file('dist/index.html').text();
const tags = [
  '<link rel="manifest" href="./manifest.webmanifest">',
  '<link rel="icon" href="./icon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="./apple-touch-icon.png">', // iPhones ignore SVG here; the PNGs in /public were made from icon.svg
].join('');
await Bun.write('dist/index.html', html.replace('</head>', `${tags}</head>`));

// Compressed copies (.br brotli, .gz gzip) made once here, so the server never compresses on each request
// (server/static.mjs sends the one the browser accepts). Keep the list the same as COMPRESSIBLE there.
const COMPRESS = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);
let before = 0;
let after = 0;
for (const entry of await readdir('dist', { recursive: true })) {
  const file = join('dist', String(entry));
  const ext = file.slice(file.lastIndexOf('.'));
  if (!COMPRESS.has(ext)) continue;
  const data = await Bun.file(file).bytes();
  if (data.length < 1024) continue; // too small to be worth it
  const br = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } });
  await Bun.write(`${file}.br`, br);
  await Bun.write(`${file}.gz`, gzipSync(data, { level: 9 }));
  before += data.length;
  after += br.length;
}
console.log(`Built ${result.outputs.length} files into dist/ (app files ${Math.round(before / 1024)} KB, ${Math.round(after / 1024)} KB compressed)`);
