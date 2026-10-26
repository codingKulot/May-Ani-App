import { useEffect, useState } from 'react';
import {
  LuApple, LuBeef, LuCloud, LuCloudRain, LuCloudSun, LuFish, LuLocateFixed, LuMapPin, LuSprout, LuSun, LuWaves, LuZap,
} from 'react-icons/lu';
import type { AppIcon, GeoPlace, Sector } from '@/types';
import { placeLabel } from '@/data/places';
import { locateMe, searchAnyPlace } from '@/services/geocode';
import { describeCode, type WxIcon } from '@/services/weather';
import { useDebounced } from '@/core/hooks';
import { sum } from '@/lib/format';
import { toast } from './ui';

export function WeatherIcon({ code, size = 28 }: { code: number; size?: number }) {
  const { icon } = describeCode(code);
  const map: Record<WxIcon, AppIcon> = { sun: LuSun, 'cloud-sun': LuCloudSun, cloud: LuCloud, rain: LuCloudRain, storm: LuZap, fog: LuWaves };
  const C = map[icon];
  const color = icon === 'sun' || icon === 'cloud-sun' ? '#e8a317' : icon === 'rain' || icon === 'storm' ? '#1c6fb8' : '#6b7c88';
  return <C size={size} color={color} aria-hidden="true" />;
}

const SECTOR_ICON: Record<Sector, AppIcon> = { crops: LuSprout, fruits: LuApple, fish: LuFish, livestock: LuBeef };

/** A farm type's icon on its tinted tile (green crops, yellow fruits, blue fish, red livestock: `.ic.<sector>` in styles.css). */
export function SectorIcon({ sector, size = 22 }: { sector: Sector; size?: number }) {
  const Icon = SECTOR_ICON[sector] ?? LuSprout;
  return <span className={`ic ${sector}`} aria-hidden="true"><Icon size={size} /></span>;
}

/** Search-as-you-type place picker (bundled list + online geocoder) with "use my location". */
export function PlaceSelect({ value, onChange, id }: { value: GeoPlace; onChange: (p: GeoPlace) => void; id?: string }) {
  const [text, setText] = useState(placeLabel(value));
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GeoPlace[]>([]);
  const q = useDebounced(text, 250);

  useEffect(() => setText(placeLabel(value)), [value.name, value.province]);
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    searchAnyPlace(q === placeLabel(value) ? '' : q, ctl.signal).then(setResults).catch(() => {});
    return () => ctl.abort();
  }, [q, open]);

  return (
    <div style={{ position: 'relative' }}>
      <div className="input-group">
        <input
          id={id}
          className="input"
          value={text}
          autoComplete="off"
          placeholder="Type your town or city"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
        />
        <button
          type="button"
          className="btn secondary"
          title="Use my current location"
          aria-label="Use my current location"
          onClick={() => locateMe().then((p) => { onChange(p); toast(`Location set near ${placeLabel(p)}`); }).catch((e: Error) => toast(e.message))}
        >
          <LuLocateFixed size={18} />
        </button>
      </div>
      {open && results.length > 0 ? (
        <ul role="listbox" className="card" style={{ position: 'absolute', zIndex: 10, left: 0, right: 56, top: 48, margin: 0, padding: 4, listStyle: 'none', maxHeight: 260, overflow: 'auto' }}>
          {results.map((p) => (
            <li key={`${p.name}|${p.province}|${p.lat}`} role="option" aria-selected={false}>
              <button type="button" className="convo" style={{ padding: '10px 8px' }} onMouseDown={(e) => { e.preventDefault(); onChange(p); setText(placeLabel(p)); setOpen(false); }}>
                <LuMapPin size={16} /> {placeLabel(p)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const CHART_COLORS = ['#1f9d6a', '#7b61c9', '#e8a317', '#3b82c4', '#d9534f', '#2aa7a0', '#8a9a8f'];

/** Donut chart; each slice is also labelled in the legend so colour is never the only cue. */
export function Donut({ data, centerTop, centerBottom }: { data: { label: string; value: number }[]; centerTop: string; centerBottom: string }) {
  const total = sum(data.map((d) => d.value));
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label={`${centerBottom}: ${centerTop}`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#edf2ee" strokeWidth="20" />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * c;
            const el = (
              <circle
                key={d.label}
                cx="70" cy="70" r={r} fill="none" stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="20"
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)"
              />
            );
            offset += len;
            return el;
          })}
        <text x="70" y="68" textAnchor="middle" fontSize="15" fontWeight="700" fill="#14231a">{centerTop}</text>
        <text x="70" y="85" textAnchor="middle" fontSize="9" fill="#5c6d62">{centerBottom}</text>
      </svg>
      <div className="legend">
        {data.map((d, i) => (
          <div key={d.label}>
            <i style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            {d.label}
            <span className="p">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
