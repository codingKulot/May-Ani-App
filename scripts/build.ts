// Production build: bundles index.html (+ TSX, CSS) with Bun and copies /public.
import { cp, rm } from 'node:fs/promises';

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
console.log(`Built ${result.outputs.length} files into dist/`);
