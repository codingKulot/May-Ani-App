import { Fragment, useState } from 'react';
import { LuArrowLeft, LuCheck, LuPencil, LuTrash2 } from 'react-icons/lu';
import { Link, navigate } from '@/core/router';
import { useAppState } from '@/core/store';
import { deletePlan, savePlanAsFarm } from '@/core/actions';
import { catalogById, planSectors, plantsLabel, SECTOR_LABEL, waitLabel } from '@/data/catalog';
import { peso } from '@/lib/format';
import { BudgetSplit, ForecastCard } from '@/components/ForecastCard';
import { Alert, Badge, Button, Card, Empty, LinkButton, Stat, Tabs, askConfirm, toast } from '@/components/ui';
import { PlanLayout } from '@/components/PlanLayout';
import { BuildStudio } from '@/components/build/BuildStudio';
import { Donut } from '@/components/widgets';

type Tab = 'overview' | 'layout' | 'infra' | 'budget' | 'schedule';
const DIFF = ['', 'Easy', 'Moderate', 'Advanced'];

export function PlanDetail({ id }: { id: string }) {
  const { plans, farms } = useAppState();
  const [tab, setTab] = useState<Tab>('overview');
  const plan = plans.find((p) => p.id === id);

  if (!plan) {
    return <div className="page narrow"><Empty icon="🗺️" title="Plan not found" action={<LinkButton to="/planner">Create a plan</LinkButton>}>It may have been deleted.</Empty></div>;
  }
  const { input, result: r } = plan;
  const farm = plan.farmId ? farms.find((f) => f.id === plan.farmId) : undefined;
  const items = r.allocations.map((a) => ({ a, item: catalogById(a.itemId)! })).filter((x) => x.item);
  const sectors = planSectors(input);
  const blocksOf = (itemId: string) => r.layout.rects.filter((x) => x.itemId === itemId && x.kind === 'orchard');
  const mixed = sectors.length > 1;
  const unit = input.areaSqm >= 10000 ? `${(input.areaSqm / 10000).toFixed(2)} ha` : `${input.areaSqm} sq. meters`;

  const save = () => {
    const f = savePlanAsFarm(plan.id);
    if (f) { toast('Saved! Your farm, production records and first tasks are ready.'); navigate(`/farms/${f.id}`); }
  };

  return (
    <div className="page narrow">
      <div className="row" style={{ marginBottom: 12 }}>
        <Link to="/planner" className="icon-btn" title="Back to planner"><LuArrowLeft size={20} /></Link>
        <div className="grow"><h1>Your Plan</h1></div>
        <Link to={`/planner?edit=${plan.id}`} className="btn ghost sm"><LuPencil size={14} /> Edit</Link>
        <Button size="sm" variant="ghost" title="Delete plan" onClick={async () => {
          if (!(await askConfirm({ title: 'Delete this plan?', message: 'Its photos and AI pictures on this phone are deleted too. This cannot be undone.', ok: 'Delete plan', danger: true }))) return;
          deletePlan(plan.id); navigate('/farms');
        }}><LuTrash2 size={14} /></Button>
      </div>

      <Card>
        <div className="row between wrap">
          <div>
            <h2 style={{ marginBottom: 4 }}>{r.title}</h2>
            <p className="small muted">{unit} · {peso(input.capital)} budget · {input.location.name}, {input.location.province}</p>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }} aria-label="Types in this plan">{sectors.map((x) => <Badge key={x} tone="gray">{SECTOR_LABEL[x]}</Badge>)}</div>
          </div>
          {farm ? <Badge><LuCheck size={12} /> Saved to My Farm</Badge> : <Badge tone="orange">Draft</Badge>}
        </div>
        <p style={{ marginTop: 10 }}>{r.summary}</p>
      </Card>

      <div style={{ marginTop: 14 }}>
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[
          { id: 'overview', label: 'Overview' }, { id: 'layout', label: 'Layout' }, { id: 'infra', label: 'Water & Power' }, { id: 'budget', label: 'Budget' }, { id: 'schedule', label: 'Schedule' },
        ]} />
      </div>

      {tab === 'overview' ? (
        <div className="stack">
          {r.warnings.map((w, i) => <Alert key={i} tone={i === 0 && /below|covers|too small|couldn't/.test(w) ? 'orange' : 'blue'} title={i === 0 && /below|covers/.test(w) ? 'Budget check' : 'Good to know'}>{w}</Alert>)}

          {items.length > 0 ? (
            <Card title="Recommended for you">
              <div className="list">
                {items.map(({ a, item }, k) => (
                  <Fragment key={item.id}>
                  {mixed && item.sector !== items[k - 1]?.item.sector ? <div className="small bold muted" style={{ paddingTop: k ? 6 : 0 }}>{SECTOR_LABEL[item.sector]}</div> : null}
                  <div className="item" style={{ alignItems: 'flex-start' }}>
                    <span className="thumb">{item.emoji}</span>
                    <div className="grow">
                      <div className="row between"><span className="bold">{item.name}{item.localName ? <span className="muted small"> · {item.localName}</span> : null}</span><Badge tone={item.difficulty === 1 ? 'green' : item.difficulty === 2 ? 'orange' : 'red'}>{DIFF[item.difficulty]}</Badge></div>
                      <div className="small muted">{a.areaSqm} sqm{plantsLabel(item, a.areaSqm, blocksOf(item.id)) ? ` (${plantsLabel(item, a.areaSqm, blocksOf(item.id))})` : ''} · first {item.sector === 'crops' || item.sector === 'fruits' ? 'harvest' : 'sale'} in {waitLabel(item.daysToHarvest)} · ≈ {Math.round(a.areaSqm * item.yieldKgPerSqm)} kg {item.sector === 'fruits' && item.cycleDays === 365 ? 'a year once bearing' : 'per cycle'} at {peso(item.farmGatePerKg)}/kg</div>
                      <div className="small" style={{ marginTop: 2 }}>{item.notes}</div>
                    </div>
                  </div>
                  </Fragment>
                ))}
              </div>
            </Card>
          ) : null}

          <Card title="Cost estimate">
            <div className="grid stats" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
              <Stat label="Initial cost" value={peso(r.cost.initial)} sub={r.cost.initial > input.capital ? <span className="down">Over your budget</span> : 'Within your budget'} tone={r.cost.initial > input.capital ? 'red' : 'green'} />
              <Stat label="Monthly operating cost" value={peso(r.cost.monthlyOperating)} />
              <Stat label="Est. monthly income" value={`${peso(r.cost.monthlyIncomeMin)} – ${peso(r.cost.monthlyIncomeMax)}`} tone="blue" sub={r.cost.paybackMonths ? `Payback ≈ ${r.cost.paybackMonths} months` : 'No payback at these assumptions'} />
            </div>
            {r.split ? <><hr className="sep" /><BudgetSplit split={r.split} /></> : null}
            <p className="disclaimer" style={{ marginTop: 12 }}>{r.assumptions[0]}</p>
          </Card>

          <div className="row wrap" style={{ gap: 10 }}>
            {farm ? <LinkButton to={`/farms/${farm.id}`}>Open my farm</LinkButton> : <Button onClick={save}>Save Plan</Button>}
            <Button variant="secondary" onClick={() => window.print()}>Print / save as PDF</Button>
          </div>
        </div>
      ) : null}

      {tab === 'layout' ? (
        <div className="stack">
          <Card title="Site layout">
            {r.layout.rects.length ? <PlanLayout layout={r.layout} /> : <Empty title="No layout available" />}
            <p className="disclaimer" style={{ marginTop: 12 }}>{r.assumptions.find((x) => x.includes('layout')) ?? ''}</p>
          </Card>
          <BuildStudio plan={plan} />
        </div>
      ) : null}

      {tab === 'infra' ? (
        <div className="stack">
          <Card title="💧 Water supply">
            <div className="kv"><span className="muted">Daily demand</span><span className="big">{r.water.demandLPerDay.toLocaleString()} L/day</span>
              <span className="muted">Storage tank</span><span className="big">{r.water.tankLitres ? `${r.water.tankLitres.toLocaleString()} L (≈ ${r.water.tankDays} days)` : 'Not needed / direct supply'}</span>
              <span className="muted">Pump</span><span className="big">{r.water.pumpHp ? `${r.water.pumpHp} HP` : 'None needed'}</span>
              <span className="muted">Method</span><span className="bold">{r.water.method}</span></div>
            <p className="small" style={{ margin: '10px 0' }}>{r.water.source}</p>
            <ol className="steps small">{r.water.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
          </Card>
          <Card title="🌧️ Drainage">
            <div className="kv"><span className="muted">Main canal</span><span className="big">{r.drainage.canalLengthM} m · {r.drainage.canalSize}</span>
              <span className="muted">Grade</span><span className="big">{r.drainage.slopePct}% toward outlet</span>
              <span className="muted">Storm storage</span><span className="big">≈ {r.drainage.retentionM3} m³</span></div>
            <ol className="steps small" style={{ marginTop: 10 }}>{r.drainage.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
          </Card>
          <Card title="⚡ Electrical">
            {r.electrical.loadsW.length ? (
              <div className="table-wrap"><table className="tbl"><thead><tr><th>Load</th><th className="num">Watts</th><th className="num">Hours/day</th></tr></thead>
                <tbody>{r.electrical.loadsW.map((l) => <tr key={l.label}><td>{l.label}</td><td className="num">{l.watts}</td><td className="num">{l.hoursPerDay}</td></tr>)}
                  <tr><td className="bold">Total</td><td className="num bold">{r.electrical.totalW}</td><td className="num bold">{r.electrical.dailyKwh} kWh/day</td></tr></tbody></table></div>
            ) : null}
            <ol className="steps small" style={{ marginTop: 10 }}>{r.electrical.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
          </Card>
          <p className="disclaimer">First-pass design for planning. Have a licensed professional review water, drainage and electrical work before construction.</p>
        </div>
      ) : null}

      {tab === 'budget' ? (
        <div className="stack">
          <Card title="Where the start-up money goes">
            <Donut data={r.cost.breakdown.map((b) => ({ label: b.label, value: b.amount }))} centerTop={peso(r.cost.initial)} centerBottom="initial cost" />
            <hr className="sep" />
            <div className="table-wrap"><table className="tbl"><tbody>
              {r.cost.breakdown.map((b) => <tr key={b.label}><td>{b.label}</td><td className="num">{peso(b.amount)}</td></tr>)}
              <tr><td className="bold">Total</td><td className="num bold">{peso(r.cost.initial)}</td></tr>
            </tbody></table></div>
          </Card>
          <ForecastCard result={r} goal={input.goal} capital={input.capital} />
          <Card title="Monthly picture">
            <div className="kv"><span className="muted">Operating cost</span><span className="big">{peso(r.cost.monthlyOperating)}</span>
              <span className="muted">Income (low – high)</span><span className="big">{peso(r.cost.monthlyIncomeMin)} – {peso(r.cost.monthlyIncomeMax)}</span>
              <span className="muted">Net (low – high)</span><span className="big">{peso(r.cost.monthlyIncomeMin - r.cost.monthlyOperating)} – {peso(r.cost.monthlyIncomeMax - r.cost.monthlyOperating)}</span></div>
          </Card>
          <Card title="How we estimated this"><ul className="steps small">{r.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul></Card>
        </div>
      ) : null}

      {tab === 'schedule' ? (
        <Card title={r.schedule.some((t) => t.week > 52) ? 'Your schedule' : 'Your first weeks'}>
          <div className="timeline">{r.schedule.map((t, i) => <div className="t" key={i}><span className="wk">{t.week > 52 ? `Year ${Math.ceil(t.week / 52)}` : `Week ${t.week}`}</span><div><div className="bold">{t.title}</div><div className="small muted">{t.detail}</div></div></div>)}</div>
        </Card>
      ) : null}
    </div>
  );
}
