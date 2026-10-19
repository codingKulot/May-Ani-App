// The built app (dist/, from `bun run build`): only files inside that folder.
//   * Compressed copies made by the build (.br brotli, .gz gzip) are sent to browsers that accept them: about a quarter of the size.
//   * Files whose name carries a content hash (chunk-<hash>.js / .css) never change, so browsers keep them for a year.
//     index.html, sw.js and the manifest are checked every time (no-cache); an unchanged file answers 304 with no body.
//   * An address without a file extension gets index.html (the app); a missing file with an extension is a real 404, so an old
//     page asking for a chunk that a newer build replaced gets an error instead of HTML in place of JavaScript.

import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.map': 'application/json',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
/** File types the build compresses (scripts/build.ts). */
export const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);
const ALWAYS_CHECK = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);
const HASHED = /^chunk-[a-z0-9]+\.(js|css)$/i;

/** The encodings a browser accepts ("gzip, deflate, br;q=1"), without those marked q=0. */
function accepted(header) {
  const out = new Set();
  for (const part of String(header ?? '').toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';').map((s) => s.trim());
    const q = params.find((p) => p.startsWith('q='));
    if (name && !(q && Number(q.slice(2)) === 0)) out.add(name);
  }
  return out;
}

/** `distDir`: the built app folder. `json` from server/http.mjs, for the error answers. */
export function staticFiles({ distDir, json }) {
  const DIST = path.resolve(distDir);

  /** A pre-compressed copy that is at least as new as the file itself (an older one belongs to an earlier build). */
  async function compressed(file, info, accepts) {
    for (const [enc, ext] of [['br', '.br'], ['gzip', '.gz']]) {
      if (!accepts.has(enc)) continue;
      try {
        const s = await stat(file + ext);
        if (s.mtimeMs >= info.mtimeMs) return { enc, file: file + ext, size: s.size };
      } catch { /* not made for this file */ }
    }
    return null;
  }

  return async function serveStatic(req, res, url) {
    let wanted;
    try { wanted = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: 'Bad address' }); } // a broken %-code
    let file = path.join(DIST, wanted);
    // Only files inside dist. The separator matters: a plain startsWith(DIST) would also allow a folder next to it, like "dist-old".
    if (file !== DIST && !file.startsWith(DIST + path.sep)) return json(res, 403, { error: 'Forbidden' });
    if (!existsSync(DIST)) return json(res, 404, { error: 'Frontend not built. Run: bun run build' });
    let info;
    try {
      info = await stat(file);
      if (info.isDirectory()) { file = path.join(file, 'index.html'); info = await stat(file); }
    } catch {
      if (path.extname(wanted)) return json(res, 404, { error: 'Not found' });
      file = path.join(DIST, 'index.html'); // an app address: the app itself
      try { info = await stat(file); } catch { return json(res, 404, { error: 'Frontend not built. Run: bun run build' }); }
    }

    const ext = path.extname(file).toLowerCase();
    const name = path.basename(file);
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': HASHED.test(name) ? 'public, max-age=31536000, immutable' : ALWAYS_CHECK.has(name) ? 'no-cache' : 'public, max-age=86400',
      ETag: etag,
      ...(COMPRESSIBLE.has(ext) ? { Vary: 'Accept-Encoding' } : {}),
    };
    if (String(req.headers['if-none-match'] ?? '').split(',').map((s) => s.trim()).includes(etag)) {
      res.writeHead(304, headers);
      return res.end();
    }
    const packed = COMPRESSIBLE.has(ext) ? await compressed(file, info, accepted(req.headers['accept-encoding'])) : null;
    if (packed) {
      headers['Content-Encoding'] = packed.enc;
      file = packed.file;
    }
    const body = await readFile(file);
    res.writeHead(200, { ...headers, 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}
