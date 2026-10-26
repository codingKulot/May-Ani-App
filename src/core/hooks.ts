import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPlace } from '@/types';
import { fetchWeather, type WeatherData } from '@/services/weather';
import { fetchQuakes, type Quake } from '@/services/hazards';
import { loadMarket } from '@/services/market';
import { loadNcrList } from '@/services/priceWatch';
import type { NcrList } from '@/data/priceWatch';
import type { MarketSnapshot } from '@/types';

interface Async<T> { data: T | null; error: string | null; loading: boolean; reload: () => void }

const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

function useCached<T>(key: string | null, loader: (signal: AbortSignal) => Promise<T>): Async<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>(() => {
    const hit = key ? cache.get(key) : undefined;
    return { data: (hit?.value as T) ?? null, error: null, loading: !hit && !!key };
  });
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!key) return;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL && tick === 0) {
      setState({ data: hit.value as T, error: null, loading: false });
      return;
    }
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    loaderRef.current(ctl.signal)
      .then((value) => {
        cache.set(key, { at: Date.now(), value });
        setState({ data: value, error: null, loading: false });
      })
      .catch((e: Error) => {
        if (ctl.signal.aborted) return;
        // keep stale data on screen if we have it; only the error banner changes
        setState((s) => ({ ...s, loading: false, error: e.message || 'Something went wrong' }));
      });
    return () => ctl.abort();
  }, [key, tick]);

  const reload = useCallback(() => {
    if (key) cache.delete(key);
    setTick((t) => t + 1);
  }, [key]);
  return { ...state, reload };
}

const coordKey = (p: GeoPlace | null | undefined) => (p ? `${p.lat.toFixed(2)},${p.lon.toFixed(2)}` : null);

export function useWeather(place: GeoPlace | null | undefined): Async<WeatherData> {
  const k = coordKey(place);
  return useCached<WeatherData>(k ? `wx:${k}` : null, (signal) => fetchWeather(place!, signal));
}

export function useQuakes(place: GeoPlace | null | undefined): Async<Quake[]> {
  const k = coordKey(place);
  return useCached<Quake[]>(k ? `eq:${k}` : null, (signal) => fetchQuakes(place!, signal));
}

export function useMarket(feedUrl: string): Async<{ snapshot: MarketSnapshot; error?: string }> {
  return useCached(`mk:${feedUrl}`, (signal) => loadMarket({ marketFeedUrl: feedUrl }, signal));
}

/** DA Bantay Presyo's newest Metro Manila list (the server's daily copy, else the one bundled with the app). */
export function useNcrList(): Async<NcrList> {
  return useCached('ncr-prices', () => loadNcrList());
}

/** Small debounce for search inputs. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
