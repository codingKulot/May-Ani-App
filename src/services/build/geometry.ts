/**
 * Perspective helpers for drawing the plan on the user's photo.
 *
 * The user (or the AI) marks the 4 corners of the planned area on the photo, in this order as seen:
 *   far-left, far-right, near-right, near-left.
 * We map the plot rectangle (metres, x east, y south, origin at the far-left / north-west corner) to
 * those corners with a homography, so every bed in the plan lands where it would stand on the real floor.
 */

export interface Pt { x: number; y: number }
export type Quad = [Pt, Pt, Pt, Pt];
/** 3x3 row-major */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Solves an n x n linear system in place (Gaussian elimination with partial pivoting). Returns null if singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    if (Math.abs(A[p][i]) < 1e-12) return null;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}

/** Homography mapping the 4 `src` points onto the 4 `dst` points. Null for degenerate input. */
export function solveHomography(src: Pt[], dst: Pt[]): Mat3 | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  if (!h || h.some((n) => !Number.isFinite(n))) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyH(H: Mat3, p: Pt): Pt {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

export function invertH(H: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) return null;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

export function quadArea(q: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

/** Corners must be on the photo (with a little slack), in order far-left, far-right, near-right, near-left, forming a convex shape with real area. */
export function isValidQuad(q: Quad | null | undefined): q is Quad {
  if (!q || q.length !== 4) return false;
  if (q.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05)) return false;
  if (quadArea(q) < 0.02) return false;
  const signs = [0, 1, 2, 3].map((i) => Math.sign(cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4])));
  if (signs.some((s) => s === 0 || s !== signs[0])) return false; // not convex / self-intersecting
  const [fl, fr, nr, nl] = q;
  return fl.x < fr.x && nl.x < nr.x && fl.y < nl.y && fr.y < nr.y;
}

/** A reasonable starting trapezoid for a typical backyard photo. The user drags the corners to match. */
export function defaultQuad(): Quad {
  return [{ x: 0.22, y: 0.5 }, { x: 0.8, y: 0.5 }, { x: 0.95, y: 0.9 }, { x: 0.05, y: 0.9 }];
}

/** Homography plot metres -> photo pixels. */
export function plotToPhoto(quad: Quad, widthM: number, lengthM: number, imgW: number, imgH: number): Mat3 | null {
  if (!isValidQuad(quad) || !(widthM > 0) || !(lengthM > 0)) return null;
  const src: Pt[] = [{ x: 0, y: 0 }, { x: widthM, y: 0 }, { x: widthM, y: lengthM }, { x: 0, y: lengthM }];
  const dst = quad.map((p) => ({ x: p.x * imgW, y: p.y * imgH }));
  return solveHomography(src, dst);
}

/** Pixels on screen covered by one metre across the plot at floor point (x, y). Bigger near the camera. */
export function pxPerMetre(H: Mat3, x: number, y: number): number {
  const a = applyH(H, { x: x - 0.5, y });
  const b = applyH(H, { x: x + 0.5, y });
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Screen offset (pixels, upward) for an object `heightM` tall standing at floor point (x, y).
 * Approximation: vertical scale taken equal to the local horizontal scale (camera roughly level).
 */
export function liftPx(H: Mat3, x: number, y: number, heightM: number): number {
  return heightM * pxPerMetre(H, x, y);
}

/** Where the camera stands, projected on the floor in plot metres (used to decide which box faces are visible). */
export function cameraOnPlot(H: Mat3, imgW: number, imgH: number): Pt | null {
  const inv = invertH(H);
  return inv ? applyH(inv, { x: imgW / 2, y: imgH * 1.6 }) : null;
}
