import type { LatLon } from '@/lib/geo';

/**
 * Weather via Open-Meteo (free, no API key, CORS-enabled). Swap `fetchWeather` for another
 * provider (e.g. a PAGASA feed) without touching the UI: only the `WeatherData` shape matters.
 * Official warnings always come from PAGASA - the UI links there.
 */

export interface DayForecast {
  date: string; // yyyy-mm-dd
  code: number;
  maxC: number;
  minC: number;
  rainMm: number;
  rainProb: number; // %
  windMaxKph: number;
}

export interface WeatherData {
  fetchedAt: string;
  current: { tempC: number; code: number; humidity: number; windKph: number; rainMm: number };
  daily: DayForecast[];
}

export type Severity = 'info' | 'warning' | 'danger';
export interface Advisory {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  day?: string;
}

export type WxIcon = 'sun' | 'cloud-sun' | 'cloud' | 'rain' | 'storm' | 'fog';

export function describeCode(code: number): { label: string; icon: WxIcon } {
  if (code === 0) return { label: 'Clear', icon: 'sun' };
  if (code === 1) return { label: 'Mostly clear', icon: 'sun' };
  if (code === 2) return { label: 'Partly cloudy', icon: 'cloud-sun' };
  if (code === 3) return { label: 'Overcast', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'rain' };
  if (code >= 61 && code <= 67) return { label: 'Rain', icon: 'rain' };
  if (code >= 80 && code <= 82) return { label: 'Rain showers', icon: 'rain' };
  if (code >= 95) return { label: 'Thunderstorm', icon: 'storm' };
  return { label: 'Cloudy', icon: 'cloud' };
}

export function weatherUrl(p: LatLon): string {
  const q = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lon),
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
    timezone: 'Asia/Manila',
    forecast_days: '7',
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}

/** Parse an Open-Meteo response. Exported separately so it can be unit-tested with fixtures. */
export function parseOpenMeteo(j: any, now = new Date()): WeatherData {
  const d = j?.daily;
  const c = j?.current;
  if (!d || !c || !Array.isArray(d.time)) throw new Error('Unexpected weather response');
  const daily: DayForecast[] = d.time.map((date: string, i: number) => ({
    date,
    code: Number(d.weather_code?.[i] ?? 0),
    maxC: Math.round(Number(d.temperature_2m_max?.[i] ?? 0)),
    minC: Math.round(Number(d.temperature_2m_min?.[i] ?? 0)),
    rainMm: Math.round(Number(d.precipitation_sum?.[i] ?? 0) * 10) / 10,
    rainProb: Math.round(Number(d.precipitation_probability_max?.[i] ?? 0)),
    windMaxKph: Math.round(Number(d.wind_speed_10m_max?.[i] ?? 0)),
  }));
  return {
    fetchedAt: now.toISOString(),
    current: {
      tempC: Math.round(Number(c.temperature_2m)),
      code: Number(c.weather_code ?? 0),
      humidity: Math.round(Number(c.relative_humidity_2m ?? 0)),
      windKph: Math.round(Number(c.wind_speed_10m ?? 0)),
      rainMm: Number(c.precipitation ?? 0),
    },
    daily,
  };
}

export async function fetchWeather(p: LatLon, signal?: AbortSignal): Promise<WeatherData> {
  const res = await fetch(weatherUrl(p), { signal });
  if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
  return parseOpenMeteo(await res.json());
}

const dayName = (iso: string, i: number) =>
  i === 0 ? 'today' : i === 1 ? 'tomorrow' : new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long' });

/** Farm-relevant advisories from the next 3 days of forecast. Thresholds are conservative guides, not official warnings. */
export function advisories(w: WeatherData): Advisory[] {
  const out: Advisory[] = [];
  w.daily.slice(0, 3).forEach((day, i) => {
    const when = dayName(day.date, i);
    if (day.rainMm >= 100) {
      out.push({ id: `rain-${day.date}`, severity: 'danger', day: day.date, title: 'Extreme rainfall expected',
        detail: `About ${day.rainMm} mm forecast ${when}. Clear drains, harvest mature crops, secure animals and raise pond freeboard. Follow PAGASA and your LGU.` });
    } else if (day.rainMm >= 50) {
      out.push({ id: `rain-${day.date}`, severity: 'danger', day: day.date, title: 'Heavy rainfall advisory',
        detail: `About ${day.rainMm} mm forecast ${when}. Check canals and drainage, protect seedlings and keep feed dry.` });
    } else if (day.rainMm >= 20) {
      out.push({ id: `rain-${day.date}`, severity: 'warning', day: day.date, title: 'Moderate rain expected',
        detail: `About ${day.rainMm} mm forecast ${when}. Hold off on fertilizer and spraying; make sure drains are open.` });
    }
    if (day.windMaxKph >= 60) {
      out.push({ id: `wind-${day.date}`, severity: 'danger', day: day.date, title: 'Strong winds',
        detail: `Winds up to ${day.windMaxKph} km/h ${when}. Secure trellises, net covers, roofs and cages.` });
    } else if (day.windMaxKph >= 40) {
      out.push({ id: `wind-${day.date}`, severity: 'warning', day: day.date, title: 'Gusty winds',
        detail: `Winds up to ${day.windMaxKph} km/h ${when}. Stake tall crops.` });
    }
    if (day.maxC >= 36) {
      out.push({ id: `heat-${day.date}`, severity: 'warning', day: day.date, title: 'Very hot weather',
        detail: `High of ${day.maxC}°C ${when}. Water early, shade seedlings, add aeration to ponds and give animals extra water and shade.` });
    }
    if (day.code >= 95) {
      out.push({ id: `storm-${day.date}`, severity: 'warning', day: day.date, title: 'Thunderstorm possible',
        detail: `Thunderstorms possible ${when}. Stop outdoor electrical work and move people and animals to shelter.` });
    }
  });
  // keep the list short and put the worst first
  const rank: Record<Severity, number> = { danger: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 4);
}
