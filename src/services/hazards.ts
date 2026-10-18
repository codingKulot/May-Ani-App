import { FAULTS, type FaultSegment } from '@/data/faults';
import { distanceToPolylineKm, haversineKm, type LatLon } from '@/lib/geo';

export interface FaultProximity {
  fault: FaultSegment;
  km: number;
  nearest: LatLon;
}

/** Nearest mapped active fault (approximate dataset - see data/faults.ts). */
export function nearestFault(p: LatLon, faults: FaultSegment[] = FAULTS): FaultProximity | null {
  let best: FaultProximity | null = null;
  for (const f of faults) {
    const r = distanceToPolylineKm(p, f.points);
    if (!best || r.km < best.km) best = { fault: f, km: r.km, nearest: r.nearest };
  }
  return best;
}

export function faultAdvice(km: number): { level: 'high' | 'medium' | 'low'; text: string } {
  if (km <= 5) return { level: 'high', text: 'Very close to a mapped fault. Check PHIVOLCS FaultFinder before building; avoid placing structures directly on the fault trace and build to the National Structural Code.' };
  if (km <= 20) return { level: 'medium', text: 'Within the area where strong shaking is possible. Build light, well-braced structures, anchor tanks and shelves, and know your evacuation route.' };
  return { level: 'low', text: 'Not close to a mapped major fault, but the Philippines is seismically active everywhere. Anchor tanks and heavy equipment and keep an emergency kit.' };
}

export interface Quake {
  id: string;
  mag: number;
  place: string;
  time: string; // ISO
  lat: number;
  lon: number;
  depthKm: number;
  distanceKm: number;
}

export function quakeUrl(p: LatLon, radiusKm = 300, days = 14, now = new Date()): string {
  const start = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const q = new URLSearchParams({
    format: 'geojson',
    starttime: start,
    latitude: String(p.lat),
    longitude: String(p.lon),
    maxradiuskm: String(radiusKm),
    minmagnitude: '3',
    orderby: 'time',
    limit: '30',
  });
  return `https://earthquake.usgs.gov/fdsnws/event/1/query?${q.toString()}`;
}

export function parseQuakes(j: any, from: LatLon): Quake[] {
  const feats: any[] = Array.isArray(j?.features) ? j.features : [];
  return feats
    .map((f) => {
      const [lon, lat, depth] = f?.geometry?.coordinates ?? [];
      return {
        id: String(f?.id ?? `${lat},${lon}`),
        mag: Number(f?.properties?.mag ?? 0),
        place: String(f?.properties?.place ?? 'Unknown location'),
        time: new Date(Number(f?.properties?.time ?? 0)).toISOString(),
        lat: Number(lat),
        lon: Number(lon),
        depthKm: Math.round(Number(depth ?? 0)),
        distanceKm: Math.round(haversineKm(from, { lat: Number(lat), lon: Number(lon) })),
      };
    })
    .filter((q) => Number.isFinite(q.lat) && Number.isFinite(q.lon));
}

export async function fetchQuakes(p: LatLon, signal?: AbortSignal): Promise<Quake[]> {
  const res = await fetch(quakeUrl(p), { signal });
  if (!res.ok) throw new Error(`Earthquake service returned ${res.status}`);
  return parseQuakes(await res.json(), p);
}

export const PHIVOLCS_FAULTFINDER = 'https://faultfinder.phivolcs.dost.gov.ph';
export const HAZARD_HUNTER = 'https://hazardhunter.georisk.gov.ph';
export const PAGASA = 'https://www.pagasa.dost.gov.ph';
export const osmLink = (p: LatLon, z = 11) =>
  `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=${z}/${p.lat}/${p.lon}`;
