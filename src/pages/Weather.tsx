import { LuExternalLink, LuRefreshCw, LuTriangleAlert, LuWaves } from 'react-icons/lu';
import { useAppState } from '@/core/store';
import { useQuakes, useWeather } from '@/core/hooks';
import { FAULTS } from '@/data/faults';
import { placeLabel } from '@/data/places';
import { advisories, describeCode } from '@/services/weather';
import { HAZARD_HUNTER, PAGASA, PHIVOLCS_FAULTFINDER, faultAdvice, nearestFault, osmLink } from '@/services/hazards';
import { timeAgo } from '@/lib/format';
import { Alert, Badge, Button, Card, PageHeader, Spinner, Stat } from '@/components/ui';
import { WeatherIcon } from '@/components/widgets';

const dayLabel = (iso: string, i: number) => (i === 0 ? 'Today' : new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short' }));

export function Weather() {
  const { profile } = useAppState();
  const place = profile!.location;
  const wx = useWeather(place);
  const eq = useQuakes(place);
  const near = nearestFault(place);
  const adv = near ? faultAdvice(near.km) : null;
  const w = wx.data;
  const alerts = w ? advisories(w) : [];

  return (
    <div className="page narrow">
      <PageHeader title="Weather & Hazards" sub={placeLabel(place)}
        actions={<Button size="sm" variant="secondary" onClick={() => { wx.reload(); eq.reload(); }}><LuRefreshCw size={14} /> Refresh</Button>} />
      <div className="stack">
        {wx.error ? <Alert tone="orange" title={w ? 'Showing older data' : 'Weather unavailable'}>{wx.error}. Check your connection and try Refresh. For official warnings visit PAGASA.</Alert> : null}
        {!w && wx.loading ? <Card><div className="row"><Spinner /> Loading forecast…</div></Card> : null}
        {w ? (
          <>
            <div className="weather-card">
              <div className="row" style={{ gap: 14 }}>
                <WeatherIcon code={w.current.code} size={52} />
                <div className="grow">
                  <div className="wx-temp">{Math.round(w.current.tempC)}°C</div>
                  <div className="muted">{describeCode(w.current.code).label}</div>
                </div>
                <div className="small muted" style={{ textAlign: 'right' }}>Humidity {Math.round(w.current.humidity)}%<br />Wind {Math.round(w.current.windKph)} km/h<br />Updated {timeAgo(w.fetchedAt)}</div>
              </div>
            </div>
            {alerts.map((a) => <Alert key={a.id} tone={a.severity === 'danger' ? 'red' : a.severity === 'warning' ? 'orange' : 'blue'} title={a.title}>{a.detail}</Alert>)}
            <Card title="Next days">
              <div className="forecast" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(64px,1fr))' }}>
                {w.daily.slice(0, 7).map((d, i) => (
                  <div key={d.date} className={`day ${i === 0 ? 'today' : ''}`}>
                    {dayLabel(d.date, i)}
                    <div style={{ margin: '4px 0' }}><WeatherIcon code={d.code} size={24} /></div>
                    <b>{Math.round(d.maxC)}° <span className="muted" style={{ fontWeight: 400 }}>{Math.round(d.minC)}°</span></b>
                    <div className="tiny">{d.rainProb}% · {Math.round(d.rainMm)} mm</div>
                  </div>
                ))}
              </div>
              <p className="tiny muted" style={{ marginTop: 10 }}>Forecast from Open-Meteo. It is a guide: for typhoon and official warnings use <a href={PAGASA} target="_blank" rel="noreferrer">PAGASA <LuExternalLink size={11} /></a>.</p>
            </Card>
          </>
        ) : null}

        <Card title="Active faults near you">
          {near && adv ? (
            <div className="stack sm">
              <div className="grid stats">
                <Stat label="Nearest mapped fault" value={`${Math.round(near.km)} km`} sub={near.fault.name} tone={adv.level === 'high' ? 'red' : adv.level === 'medium' ? 'orange' : 'green'} />
                <Stat label="Region" value={near.fault.region.split('/')[0].trim()} sub="approximate" />
              </div>
              <Alert tone={adv.level === 'high' ? 'red' : adv.level === 'medium' ? 'orange' : 'blue'} title={adv.level === 'high' ? 'High proximity' : adv.level === 'medium' ? 'Moderate proximity' : 'Low proximity'}>{adv.text}</Alert>
              <FaultMap lat={place.lat} lon={place.lon} />
              <p className="tiny muted"><LuTriangleAlert size={12} /> Fault lines here are simplified and approximate, for orientation only. Check the official maps before buying land or building:</p>
              <div className="row wrap">
                <a className="btn secondary sm" href={PHIVOLCS_FAULTFINDER} target="_blank" rel="noreferrer">PHIVOLCS FaultFinder <LuExternalLink size={12} /></a>
                <a className="btn secondary sm" href={HAZARD_HUNTER} target="_blank" rel="noreferrer">HazardHunterPH <LuExternalLink size={12} /></a>
                <a className="btn secondary sm" href={osmLink(place)} target="_blank" rel="noreferrer">Open map <LuExternalLink size={12} /></a>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="Recent earthquakes (14 days, within 300 km)" action={eq.loading ? <Spinner /> : undefined}>
          {eq.error ? <p className="small muted">Could not load earthquakes ({eq.error}). Try Refresh.</p> : null}
          {eq.data && eq.data.length === 0 ? <p className="small muted">No magnitude 2.5+ earthquakes recorded nearby in this period (USGS).</p> : null}
          <div className="list">
            {(eq.data ?? []).slice(0, 8).map((q) => (
              <div key={q.id} className="row">
                <Badge tone={q.mag >= 5 ? 'red' : q.mag >= 4 ? 'orange' : 'gray'}>M{q.mag.toFixed(1)}</Badge>
                <div className="grow"><div className="bold small">{q.place}</div><div className="tiny muted">{timeAgo(q.time)} · {Math.round(q.distanceKm)} km away · depth {Math.round(q.depthKm)} km</div></div>
              </div>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}><LuWaves size={12} /> Data: USGS. Official Philippine bulletins: PHIVOLCS.</p>
        </Card>
      </div>
    </div>
  );
}

/** Simple SVG map: nearby fault traces in a ~3 degree window around the user. */
function FaultMap({ lat, lon }: { lat: number; lon: number }) {
  const span = 3; // degrees
  const W = 320, H = 220;
  const px = (la: number, lo: number): [number, number] => [((lo - (lon - span / 2)) / span) * W, H - ((la - (lat - (span * H) / W / 2)) / ((span * H) / W)) * H];
  const lines = FAULTS.filter((f) => f.points.some(([la, lo]) => Math.abs(la - lat) < span && Math.abs(lo - lon) < span));
  const [ux, uy] = px(lat, lon);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="plan-svg" role="img" aria-label="Map of fault lines near your location">
      {[1, 2].map((i) => <line key={`v${i}`} x1={(W / 3) * i} y1={0} x2={(W / 3) * i} y2={H} stroke="#d5ded7" strokeWidth={1} />)}
      {[1, 2].map((i) => <line key={`h${i}`} x1={0} y1={(H / 3) * i} x2={W} y2={(H / 3) * i} stroke="#d5ded7" strokeWidth={1} />)}
      {lines.map((f) => (
        <g key={f.id}>
          <polyline points={f.points.map(([la, lo]) => px(la, lo).join(',')).join(' ')} fill="none" stroke="#d9534f" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ))}
      <circle cx={ux} cy={uy} r={7} fill="#1c6fb8" stroke="#fff" strokeWidth={2.5} />
      <text x={ux + 11} y={uy + 4} fontSize={11} fontWeight={700} fill="#14231a">You</text>
      <text x={8} y={H - 8} fontSize={10} fill="#d9534f" fontWeight={700}>━ Fault trace (approx.)</text>
    </svg>
  );
}
