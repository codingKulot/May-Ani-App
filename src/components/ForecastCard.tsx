import { useMemo } from 'react';
import { useAppState } from '@/core/store';
import { useMarket } from '@/core/hooks';
import { applyOverrides } from '@/services/market';
import { forecastQuantities } from '@/services/forecast';
import { num, peso } from '@/lib/format';
import { LuPlus, LuX } from 'react-icons/lu';
import { catalogById } from '@/data/catalog';
import type { CatalogItem, Goal, PlanResult, Sector } from '@/types';
import { Alert, Badge, Button, Card, Empty, Progress } from './ui';

const kg = (n: number) => (n >= 100 ? num(Math.round(n)) : num(Math.round(n * 10) / 10, n < 10 ? 1 : 0));

/**
 * "What will I harvest, and what is it worth?" Shows the expected quantity per item for the capital entered,
 * priced at the farm-gate price and at the market price, using the same prices as the Market screen.
 */
/** Planner only: the list follows what the user picked, with buttons to add and remove items. */
export interface ForecastPicking {
  sector: Sector;
  picked: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenPicker: () => void;
}

const VERB: Record<Sector, string> = { crops: 'grow', fish: 'raise', livestock: 'raise' };

export function ForecastCard({ result, goal, capital, picking }: { result: PlanResult | null; goal: Goal; capital?: number; picking?: ForecastPicking }) {
  const s = useAppState();
  const mk = useMarket(s.settings.marketFeedUrl);
  const snap = useMemo(() => (mk.data ? applyOverrides(mk.data.snapshot, s.marketOverrides) : null), [mk.data, s.marketOverrides]);
  const f = useMemo(() => (result && snap ? forecastQuantities(result, snap.prices, goal) : null), [result, snap, goal]);
  const title = `What ${capital !== undefined ? `${peso(capital)} ` : ''}could produce`;
  const addBtn = picking ? <Button variant="secondary" size="sm" onClick={picking.onOpenPicker}><LuPlus size={14} /> Add item</Button> : null;

  if (!result || (result.allocations.length === 0 && !picking?.picked.length)) {
    return <Card title="Forecast"><Empty icon="📈" title="Enter your starting capital">We'll show how much you can expect to harvest, and what it is worth.</Empty></Card>;
  }

  // nothing picked yet: offer the planner's suggestions as one-tap adds instead of a forecast for items the user never chose
  if (picking && picking.picked.length === 0) {
    const suggestions = result.allocations.map((a) => catalogById(a.itemId)).filter((x): x is CatalogItem => !!x);
    return (
      <Card title={title}>
        <Empty icon="🧺" title={`Pick what you want to ${VERB[picking.sector]}`} action={addBtn}>
          We'll show how much each one can harvest with your capital, and what it is worth.
        </Empty>
        {suggestions.length ? (
          <div className="stack sm" style={{ alignItems: 'center', textAlign: 'center' }}>
            <span className="small muted">Suggested for your space and budget:</span>
            <div className="chips" style={{ justifyContent: 'center' }}>
              {suggestions.map((i) => <button key={i.id} type="button" className="chip" onClick={() => picking.onAdd(i.id)}><LuPlus size={14} /> {i.emoji} {i.name}</button>)}
            </div>
          </div>
        ) : null}
      </Card>
    );
  }
  if (!f) return <Card title="Forecast"><p className="small muted">Loading prices…</p></Card>;

  const left = picking ? picking.picked.filter((id) => !f.rows.some((r) => r.itemId === id)).map((id) => catalogById(id)).filter((x): x is CatalogItem => !!x) : [];
  const live = snap?.source === 'feed';
  return (
    <Card title={title} action={<Badge tone={live ? 'green' : 'orange'}>{live ? 'Price feed' : 'Estimated prices'}</Badge>}>
      <div className="stack">
        <div className="forecast-totals">
          <div className="stat green"><div className="k">Expected harvest per cycle</div><div className="v">{kg(f.total.kgExpected)} kg</div><div className="s">Range {kg(f.total.kgMin)} to {kg(f.total.kgMax)} kg</div></div>
          <div className="stat"><div className="k">Worth at farm-gate</div><div className="v">{peso(f.total.valueFarmGate)}</div><div className="s">Sold to a trader at the farm</div></div>
          <div className="stat blue"><div className="k">Worth at market price</div><div className="v">{peso(f.total.valueMarket)}</div><div className="s">{f.total.extraIfSoldAtMarket > 0 ? `+${peso(f.total.extraIfSoldAtMarket)} if sold direct` : 'Retail price'}</div></div>
        </div>

        <div className="list">
          {f.rows.map((r) => (
            <div key={r.itemId} className="stack sm">
              <div className="row">
                <span className="thumb">{r.emoji}</span>
                <div className="grow">
                  <div className="bold">{r.name}</div>
                  <div className="small muted">{num(Math.round(r.areaSqm * 10) / 10)} sqm · first harvest in about {r.daysToFirstHarvest} days · cycle {r.cycleDays} days</div>
                </div>
                <div style={{ textAlign: 'right' }}><div className="bold">{kg(r.kgExpected)} kg</div><div className="tiny muted">{kg(r.kgMin)}–{kg(r.kgMax)} kg</div></div>
                {picking ? <button type="button" className="icon-btn" aria-label={`Remove ${r.name}`} title="Remove" onClick={() => picking.onRemove(r.itemId)}><LuX size={16} /></button> : null}
              </div>
              <div className="kv small">
                <span className="muted">Farm-gate price</span><span><b>{peso(r.farmGatePerKg)}</b>/kg → {peso(r.valueFarmGate)}</span>
                <span className="muted">Market price</span><span><b>{peso(r.marketPerKg)}</b>/kg → {peso(r.valueMarket)}</span>
              </div>
              <div className="row"><div className="grow"><Progress value={r.farmerSharePct} warn={r.farmerSharePct < 50} label="Share of the market price you receive at farm-gate" /></div><span className="tiny">You get {r.farmerSharePct}% at farm-gate</span></div>
            </div>
          ))}
        </div>

        {left.length ? (
          <div className="row wrap small">
            <span className="muted">Left out (not enough space or capital this phase; your first picks are kept):</span>
            {left.map((i) => <span key={i.id} className="chip">{i.emoji} {i.name}<button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`Remove ${i.name}`} onClick={() => picking!.onRemove(i.id)}><LuX size={12} /></button></span>)}
          </div>
        ) : null}
        {addBtn ? <div>{addBtn}</div> : null}

        <Alert tone="blue" title="How to read this">
          Quantity is per full growing cycle for the area the plan can fund with your capital. {live ? '' : 'Prices are planning estimates, not live: set your own on the Market screen for a closer number. '}Selling direct earns more per kilo but takes time, transport and some unsold stock. Livestock quantities are kilos live weight.
        </Alert>
      </div>
    </Card>
  );
}
