import { useMemo, useState } from 'react';
import {
  LuBell, LuBookOpen, LuCircleAlert, LuCircleCheck, LuClipboardList, LuCloudSun, LuMapPin, LuSparkles,
  LuStethoscope, LuTag, LuWallet, LuWheat, LuTrendingUp, LuTrendingDown, LuReceipt, LuRefreshCw, LuTriangleAlert,
} from 'react-icons/lu';
import { Link } from '@/core/router';
import { useAppState } from '@/core/store';
import { useWeather } from '@/core/hooks';
import { catalogById, planSectors, sectorsLabel } from '@/data/catalog';
import { placeLabel } from '@/data/places';
import { verseForDate } from '@/data/verses';
import { addDays, daysBetween, greeting, isoDate, peso, prettyDate, sum, timeAgo } from '@/lib/format';
import { advisories, describeCode } from '@/services/weather';
import { nearestFault } from '@/services/hazards';
import { Alert, Button, Card, Empty, LinkButton, Progress, Stat, Tabs } from '@/components/ui';
import { SectorIcon, WeatherIcon } from '@/components/widgets';

const monthKey = (iso: string) => iso.slice(0, 7);

export function Dashboard() {
  const s = useAppState();
  const profile = s.profile!;
  const today = isoDate();
  const thisMonth = monthKey(today);
  const lastMonth = monthKey(addDays(`${thisMonth}-01`, -1));
  const wx = useWeather(profile.location);
  const [prodTab, setProdTab] = useState<'crops' | 'aqua'>('crops');
  const [verseSkip, setVerseSkip] = useState(0);
  const verse = verseForDate(today, verseSkip);

  const stats = useMemo(() => {
    const exp = (m: string) => sum(s.expenses.filter((e) => monthKey(e.date) === m).map((e) => e.amount));
    const sal = (m: string) => sum(s.sales.filter((e) => monthKey(e.date) === m).map((e) => e.kg * e.pricePerKg));
    const pct = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 100));
    return {
      exp: exp(thisMonth), expPct: pct(exp(thisMonth), exp(lastMonth)),
      sales: sal(thisMonth), salesPct: pct(sal(thisMonth), sal(lastMonth)),
      due: s.tasks.filter((t) => !t.done && t.date <= today).length,
      alerts: s.healthLog.filter((h) => !h.resolved).length,
    };
  }, [s.expenses, s.sales, s.tasks, s.healthLog, thisMonth, lastMonth, today]);

  const prod = s.production.filter((p) => {
    const sector = catalogById(p.itemId)?.sector;
    return prodTab === 'crops' ? !!sector && sector !== 'fish' : sector === 'fish';
  });

  const activity = useMemo(() => {
    const rows: { at: string; icon: 'exp' | 'sale' | 'harvest' | 'health' | 'msg'; text: string }[] = [];
    s.expenses.slice(0, 5).forEach((e) => rows.push({ at: `${e.date}T12:00:00`, icon: 'exp', text: `You added an expense: ${e.note || e.category} - ${peso(e.amount)}` }));
    s.sales.slice(0, 5).forEach((x) => rows.push({ at: `${x.date}T12:00:00`, icon: 'sale', text: `Sale recorded: ${x.kg} kg ${catalogById(x.itemId)?.name ?? ''} - ${peso(x.kg * x.pricePerKg)}` }));
    s.production.filter((p) => p.harvestedOn).slice(0, 5).forEach((p) => rows.push({ at: `${p.harvestedOn}T12:00:00`, icon: 'harvest', text: `Harvest record updated: ${catalogById(p.itemId)?.name ?? ''}` }));
    s.healthLog.slice(0, 3).forEach((h) => rows.push({ at: `${h.date}T12:00:00`, icon: 'health', text: `Health check saved: ${h.title}` }));
    s.chats.filter((m) => m.from === 'them' && !m.contactId.startsWith('sample-')).slice(-3).forEach((m) => rows.push({ at: m.at, icon: 'msg', text: `New message: ${m.text.slice(0, 50)}` }));
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  }, [s.expenses, s.sales, s.production, s.healthLog, s.chats]);

  const adv = wx.data ? advisories(wx.data) : [];
  const fault = nearestFault(profile.location);
  const firstName = profile.name.split(' ')[0];
  const alertCount = adv.length + stats.alerts;

  return (
    <div className="page">
      <header className="hello">
        <div className="grow">
          <small><LuMapPin size={14} /> {placeLabel(profile.location)} · {prettyDate(today)}</small>
          <h1>{greeting()}, {firstName}!</h1>
        </div>
        <Link to="/weather" className="bell" title="Alerts" aria-label={`Alerts${alertCount ? `: ${alertCount}` : ''}`}>
          <LuBell size={20} />{alertCount > 0 ? <span className="nav-count">{alertCount}</span> : null}
        </Link>
      </header>

      <div className="dash-top">
        <div className="stack sm">
          <section className="wx-hero" aria-label="Weather">
            {wx.data ? (
              <>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="place">{profile.location.name}</div>
                    <div className="temp">{wx.data.current.tempC}°</div>
                    <div className="desc">{describeCode(wx.data.current.code).label} · H {wx.data.daily[0].maxC}° L {wx.data.daily[0].minC}°</div>
                  </div>
                  <span className="wx-ico"><WeatherIcon code={wx.data.current.code} size={56} /></span>
                </div>
                {adv.length > 0 ? (
                  <Link to="/weather" className={`wx-chip ${adv[0].severity === 'danger' ? 'red' : ''}`}>
                    <LuTriangleAlert size={16} /><span>{adv[0].title}. {adv[0].detail}</span>
                  </Link>
                ) : (
                  <div className="wx-chip ok"><LuCircleCheck size={16} /><span>No weather warnings in the next 3 days. Good for field work.</span></div>
                )}
                <Link to="/weather" className="more">See 7-day forecast</Link>
              </>
            ) : wx.loading ? (
              <div className="row"><span className="spinner" /> <span className="small">Loading weather…</span></div>
            ) : (
              <div className="row"><LuCloudSun size={30} /><div className="small grow">Weather is unavailable right now. {wx.error}</div><Button size="sm" onClick={wx.reload}>Retry</Button></div>
            )}
          </section>
          {fault && fault.km <= 20 ? (
            <Alert tone="orange" title="Fault line nearby" action={<Link to="/weather" className="more">View map</Link>}>
              About {Math.round(fault.km)} km from a mapped active fault ({fault.fault.name}).
            </Alert>
          ) : null}
        </div>

        <nav className="quick-grid dash-quick" aria-label="Quick actions" style={{ marginBottom: 0 }}>
          <Link to="/health"><span className="qi"><LuStethoscope size={24} /></span>Check health</Link>
          <Link to="/market"><span className="qi yellow"><LuTag size={24} /></span>Prices</Link>
          <Link to="/planner"><span className="qi blue"><LuClipboardList size={24} /></span>Plan</Link>
          <Link to="/manage/production"><span className="qi green"><LuWheat size={24} /></span>Records</Link>
        </nav>
      </div>

      <div className="grid stats dash-stats">
        <Stat tone="red" icon={<LuWallet size={14} />} label="Total expenses" value={peso(stats.exp)}
          sub={stats.expPct === null ? 'This month' : <span className={stats.expPct > 0 ? 'down' : 'up'}>{stats.expPct > 0 ? <LuTrendingUp size={12} /> : <LuTrendingDown size={12} />} {Math.abs(stats.expPct)}% vs last month</span>} />
        <Stat tone="green" icon={<LuReceipt size={14} />} label="Total sales" value={peso(stats.sales)}
          sub={stats.salesPct === null ? 'This month' : <span className={stats.salesPct >= 0 ? 'up' : 'down'}>{stats.salesPct >= 0 ? <LuTrendingUp size={12} /> : <LuTrendingDown size={12} />} {Math.abs(stats.salesPct)}% vs last month</span>} />
        <Stat tone="blue" icon={<LuClipboardList size={14} />} label="Tasks due today" value={stats.due} sub={<Link to="/manage/tasks">View tasks</Link>} />
        <Stat tone="orange" icon={<LuTriangleAlert size={14} />} label="Health alerts" value={stats.alerts} sub={<Link to="/health">View health</Link>} />
      </div>

      <div className="grid dash">
        <div className="stack">
          <Card title="My farms" action={<Link to="/farms" className="small bold">View all</Link>}>
            {s.farms.length === 0 ? (
              <Empty title="No farm yet" action={<LinkButton to="/planner"><LuSparkles size={16} /> Create your first plan</LinkButton>}>
                Tell us about your land and budget and we will draft a full plan: crops, layout, water, drainage and costs.
              </Empty>
            ) : (
              <div className="farm-cards">
                {s.farms.slice(0, 3).map((f) => {
                  const sector = planSectors(f)[0] ?? f.sector;
                  // the newest crop or batch on this farm that is not harvested yet: shows how far along it is
                  const growing = s.production.filter((p) => p.farmId === f.id && !p.harvestedOn).sort((a, b) => b.plantedOn.localeCompare(a.plantedOn))[0];
                  const item = growing ? catalogById(growing.itemId) : undefined;
                  const elapsed = growing ? Math.max(0, daysBetween(growing.plantedOn, today)) : 0;
                  const pct = item ? Math.min(100, Math.round((elapsed / item.daysToHarvest) * 100)) : 0;
                  const left = item ? Math.max(0, item.daysToHarvest - elapsed) : 0;
                  return (
                    <Link key={f.id} to={`/farms/${f.id}`} className="farm-card">
                      <div className="row">
                        <SectorIcon sector={sector} />
                        <div className="grow">
                          <div className="bold">{f.name}</div>
                          <div className="small muted">
                            {item ? (left === 0 ? `${item.name} ready to harvest` : `${item.name} · harvest in ${left} days`)
                              : `${sectorsLabel(planSectors(f))} · ${f.areaSqm >= 10000 ? `${(f.areaSqm / 10000).toFixed(2)} ha` : `${f.areaSqm} sqm`}`}
                          </div>
                        </div>
                        {item ? <span className="pct">{pct}%</span> : null}
                      </div>
                      {item ? <Progress value={pct} tone={sector} label={`${item.name} progress`} /> : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Production overview">
            <Tabs tabs={[{ id: 'crops', label: 'Crops, fruits & livestock' }, { id: 'aqua', label: 'Aquaculture' }]} value={prodTab} onChange={setProdTab} />
            {prod.length === 0 ? (
              <Empty icon="🌾" title="Nothing in production here yet" action={<LinkButton to="/manage/production" variant="secondary" size="sm">Add a production record</LinkButton>} />
            ) : (
              <div className="list">
                {prod.slice(0, 5).map((p) => {
                  const item = catalogById(p.itemId);
                  const done = (p.harvestedKg ?? 0) > 0;
                  const elapsed = Math.max(0, daysBetween(p.plantedOn, today));
                  const pct = item ? Math.min(100, (elapsed / item.daysToHarvest) * 100) : 0;
                  const left = item ? Math.max(0, item.daysToHarvest - elapsed) : 0;
                  return (
                    <div key={p.id} className="stack sm">
                      <div className="row between"><span className="bold">{item?.emoji} {item?.name}</span><span className="small muted">{done ? `Harvested ${p.harvestedKg} kg` : left === 0 ? 'Ready to harvest' : `${left} days to harvest`}</span></div>
                      <Progress value={done ? 100 : pct} tone={item?.sector} label={`${item?.name} progress`} />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title={<span className="row" style={{ gap: 8 }}><LuBookOpen size={18} color="#0f6b3a" /> {verseSkip === 0 ? 'Verse of the day' : 'Another verse'}</span>}
            action={<span className="badge">{verse.topic}</span>}>
            <blockquote className="verse-text">“{verse.text}”</blockquote>
            <div className="row between" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
              <span className="small bold">{verse.ref} <span className="tiny faint">(KJV)</span></span>
              <span className="row" style={{ gap: 6 }}>
                {verseSkip !== 0 ? <Button size="sm" variant="secondary" onClick={() => setVerseSkip(0)}>Today's verse</Button> : null}
                <Button size="sm" variant="secondary" onClick={() => setVerseSkip((n) => n + 1)}><LuRefreshCw size={14} /> Another</Button>
              </span>
            </div>
          </Card>

          <Card title="Recent activity">
            {activity.length === 0 ? (
              <Empty icon="📝" title="No activity yet">Expenses, sales, harvests and health checks you record show up here.</Empty>
            ) : (
              <div className="list">
                {activity.map((a, i) => (
                  <div key={i} className="item">
                    <span className="thumb" style={{ width: 36, height: 36, fontSize: 16 }}>{a.icon === 'exp' ? '💸' : a.icon === 'sale' ? '💰' : a.icon === 'harvest' ? '🧺' : a.icon === 'health' ? '🩺' : '💬'}</span>
                    <div className="grow small">{a.text}</div>
                    <span className="tiny faint nowrap">{timeAgo(a.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card tint>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <LuCircleAlert size={22} color="#0f6b3a" />
              <div className="grow">
                <div className="bold">Need help with your farm?</div>
                <p className="small muted">Send a photo or describe a plant, animal or fish problem and get practical first steps.</p>
              </div>
              <LinkButton to="/health" size="sm">Ask AI</LinkButton>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
