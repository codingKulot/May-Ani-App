import { useMemo, useState } from 'react';
import {
  LuBell, LuBookOpen, LuCircleAlert, LuClipboardList, LuCloudSun, LuMapPin, LuShieldCheck, LuSparkles, LuSprout, LuStethoscope, LuWallet,
  LuTrendingUp, LuTrendingDown, LuReceipt, LuRefreshCw, LuTriangleAlert,
} from 'react-icons/lu';
import { Link } from '@/core/router';
import { useAppState } from '@/core/store';
import { useWeather } from '@/core/hooks';
import { catalogById } from '@/data/catalog';
import { placeLabel } from '@/data/places';
import { verseForDate } from '@/data/verses';
import { addDays, daysBetween, greeting, isoDate, peso, prettyDate, sum, timeAgo } from '@/lib/format';
import { advisories, describeCode } from '@/services/weather';
import { nearestFault } from '@/services/hazards';
import { Alert, Button, Card, Empty, LinkButton, PageHeader, Progress, Stat, Tabs } from '@/components/ui';
import { WeatherIcon } from '@/components/widgets';

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
    return prodTab === 'crops' ? sector === 'crops' || sector === 'livestock' : sector === 'fish';
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

  return (
    <div className="page">
      <PageHeader
        title={`${greeting()}, ${firstName}!`}
        sub={<span className="row" style={{ gap: 6 }}><LuMapPin size={14} /> {placeLabel(profile.location)} · {prettyDate(today)}</span>}
        actions={<Link to="/weather" className="icon-btn" title="Alerts"><LuBell size={20} />{adv.length + stats.alerts > 0 ? <span className="badge red" style={{ position: 'relative', left: -10, top: -10, padding: '1px 6px' }}>{adv.length + stats.alerts}</span> : null}</Link>}
      />

      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <div className="weather-card">
          {wx.data ? (
            <div className="row" style={{ gap: 14 }}>
              <WeatherIcon code={wx.data.current.code} size={44} />
              <div className="grow">
                <div className="wx-temp">{wx.data.current.tempC}°C</div>
                <div className="small muted">{describeCode(wx.data.current.code).label} · H: {wx.data.daily[0].maxC}° L: {wx.data.daily[0].minC}°</div>
              </div>
              <Link to="/weather" className="small bold">Forecast</Link>
            </div>
          ) : wx.loading ? (
            <div className="row"><span className="spinner" /> <span className="muted small">Loading weather…</span></div>
          ) : (
            <div className="row"><LuCloudSun size={30} color="#6b7c88" /><div className="small muted grow">Weather is unavailable right now. {wx.error}</div><Button size="sm" variant="secondary" onClick={wx.reload}>Retry</Button></div>
          )}
        </div>
        <div className="stack sm">
          {adv.length > 0 ? (
            <Alert tone={adv[0].severity === 'danger' ? 'red' : 'orange'} title={adv[0].title} action={<Link to="/weather" className="more">View details</Link>}>{adv[0].detail}</Alert>
          ) : wx.data ? (
            <Alert tone="green" title="No weather warnings in the next 3 days">Good conditions for field work. Always check PAGASA for official advisories.</Alert>
          ) : null}
          {fault && fault.km <= 20 ? (
            <Alert tone="orange" title="Fault line nearby" action={<Link to="/weather" className="more">View map</Link>}>
              About {Math.round(fault.km)} km from a mapped active fault ({fault.fault.name}).
            </Alert>
          ) : null}
        </div>
      </div>

      <div className="quick-grid only-mobile" style={{ marginBottom: 14 }}>
        <Link to="/planner"><LuClipboardList size={22} />Plan</Link>
        <Link to="/health"><LuStethoscope size={22} />Health</Link>
        <Link to="/weather"><LuCloudSun size={22} />Weather</Link>
        <Link to="/permits"><LuShieldCheck size={22} />Permits</Link>
      </div>

      <div className="grid stats" style={{ marginBottom: 14 }}>
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
              <div className="list">
                {s.farms.slice(0, 3).map((f) => (
                  <Link key={f.id} to={`/farms/${f.id}`} className="item">
                    <span className="thumb"><LuSprout size={22} color="#0f6b3a" /></span>
                    <div className="grow"><div className="bold">{f.name}</div><div className="small muted">{f.sector === 'crops' ? 'Vegetables/crops' : f.sector === 'fish' ? 'Aquaculture' : 'Livestock'} · {f.areaSqm >= 10000 ? `${(f.areaSqm / 10000).toFixed(2)} ha` : `${f.areaSqm} sqm`}</div></div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card title="Production overview">
            <Tabs tabs={[{ id: 'crops', label: 'Crops & livestock' }, { id: 'aqua', label: 'Aquaculture' }]} value={prodTab} onChange={setProdTab} />
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
                      <Progress value={done ? 100 : pct} label={`${item?.name} progress`} />
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
