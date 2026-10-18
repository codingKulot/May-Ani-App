export interface LatLon { lat: number; lon: number }
export interface Pt { x: number; y: number }

const R = 6371; // km

/** Great-circle distance in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance from a point to a polyline in km, plus the nearest point on it.
 * Uses a local equirectangular projection, accurate to well under 1% at fault-segment scale.
 */
export function distanceToPolylineKm(
  p: LatLon,
  line: [number, number][],
): { km: number; nearest: LatLon } {
  if (line.length === 0) return { km: Infinity, nearest: p };
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const proj = (lat: number, lon: number): Pt => ({ x: (lon - p.lon) * kmPerDegLon, y: (lat - p.lat) * kmPerDegLat });
  let best = { km: Infinity, nearest: { lat: line[0][0], lon: line[0][1] } };
  const consider = (a: Pt, b: Pt, la: [number, number], lb: [number, number]) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-a.x * dx + -a.y * dy) / len2));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    const d = Math.hypot(cx, cy);
    if (d < best.km) {
      best = { km: d, nearest: { lat: la[0] + t * (lb[0] - la[0]), lon: la[1] + t * (lb[1] - la[1]) } };
    }
  };
  if (line.length === 1) {
    const a = proj(line[0][0], line[0][1]);
    return { km: Math.hypot(a.x, a.y), nearest: { lat: line[0][0], lon: line[0][1] } };
  }
  for (let i = 0; i < line.length - 1; i++) {
    consider(proj(line[i][0], line[i][1]), proj(line[i + 1][0], line[i + 1][1]), line[i], line[i + 1]);
  }
  return best;
}

/** Shoelace area of a polygon (any units squared). */
export function polygonArea(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Real-world area (sqm) of a polygon drawn on a photo, given a reference segment on the same photo
 * (two pixel points) whose real length in metres is known.
 * Assumes the photo is roughly top-down (plan view) - perspective photos give rough estimates only.
 */
export function areaFromReference(poly: Pt[], refA: Pt, refB: Pt, refMeters: number): number {
  const refPx = dist(refA, refB);
  if (refPx <= 0 || refMeters <= 0) return 0;
  const mPerPx = refMeters / refPx;
  return polygonArea(poly) * mPerPx * mPerPx;
}
