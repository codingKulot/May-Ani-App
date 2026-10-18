import type { GeoPlace } from '@/types';
import { PLACES, searchPlaces } from '@/data/places';
import { haversineKm } from '@/lib/geo';

/** Search Philippine towns/barangays via Open-Meteo's free geocoder (no key). Falls back to the bundled list. */
export async function searchPlacesOnline(q: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  const query = q.trim();
  if (query.length < 3) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&countryCode=PH`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Place search is unavailable');
  const j = await res.json();
  const results: any[] = Array.isArray(j?.results) ? j.results : [];
  return results
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map((r) => ({
      name: String(r.name),
      province: String(r.admin2 ?? r.admin1 ?? 'Philippines'),
      lat: Number(r.latitude),
      lon: Number(r.longitude),
    }));
}

export async function searchAnyPlace(q: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  const local = searchPlaces(q, 6);
  try {
    const online = await searchPlacesOnline(q, signal);
    const seen = new Set(local.map((p) => `${p.name}|${p.province}`));
    return [...local, ...online.filter((p) => !seen.has(`${p.name}|${p.province}`))].slice(0, 10);
  } catch {
    return local;
  }
}

export function nearestKnownPlace(lat: number, lon: number): GeoPlace {
  let best = PLACES[0];
  let bestKm = Infinity;
  for (const p of PLACES) {
    const km = haversineKm({ lat, lon }, p);
    if (km < bestKm) { best = p; bestKm = km; }
  }
  return { name: best.name, province: best.province, lat, lon };
}

export function locateMe(): Promise<GeoPlace> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Location is not available on this device.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(nearestKnownPlace(pos.coords.latitude, pos.coords.longitude)),
      () => reject(new Error('We could not get your location. Please type your town instead.')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  });
}
