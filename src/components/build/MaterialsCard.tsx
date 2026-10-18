import { useEffect, useMemo, useState } from 'react';
import { LuRotateCcw } from 'react-icons/lu';
import { setMaterialPrice } from '@/core/actions';
import { PRICES_AS_OF, PRICE_FRESHNESS_NOTE, SRC_PSA_INDEX, materialById, type PriceSource } from '@/data/materials';
import { peso } from '@/lib/format';
import type { PricedDesign, PricedLine } from '@/services/build/designs';
import { Alert, Badge, Card } from '@/components/ui';

function PriceInput({ line }: { line: PricedLine }) {
  const [text, setText] = useState(String(line.unitPrice));
  useEffect(() => setText(String(line.unitPrice)), [line.unitPrice]);
  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) { setText(String(line.unitPrice)); return; }
    if (n !== line.unitPrice) setMaterialPrice(line.materialId, n);
  };
  return (
    <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
      <span className="muted small">₱</span>
      <input
        className="input price-input" inputMode="decimal" value={text} aria-label={`Your price for ${materialById(line.materialId)?.name ?? line.label}, per ${line.unit}`}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      {line.overridden ? <button type="button" className="icon-btn" title="Back to the standard price" aria-label="Back to the standard price" onClick={() => setMaterialPrice(line.materialId, null)}><LuRotateCcw size={14} /></button> : null}
    </span>
  );
}

function SourceList({ ids }: { ids: string[] }) {
  const sources = useMemo(() => {
    const m = new Map<string, PriceSource>();
    for (const id of ids) for (const s of materialById(id)?.sources ?? []) m.set(s.url, s);
    m.set(SRC_PSA_INDEX.url, SRC_PSA_INDEX);
    return [...m.values()];
  }, [ids]);
  return (
    <details className="small" style={{ marginTop: 10 }}>
      <summary className="bold" style={{ cursor: 'pointer' }}>Where these prices come from</summary>
      <div className="stack sm" style={{ marginTop: 8 }}>
        <p>Prices as of: <b>{PRICES_AS_OF}</b>.</p>
        <p>{PRICE_FRESHNESS_NOTE}</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a></li>)}
        </ul>
        <p className="muted">Items marked <b>Estimate</b> have no published Philippine price list we could verify, so we show a typical retail range. Type your own price in the table and it is used everywhere.</p>
      </div>
    </details>
  );
}

export function MaterialsCard({ priced, capital, initialEstimate }: { priced: PricedDesign; capital: number; initialEstimate: number }) {
  const over = priced.total - capital;
  const usedIds = useMemo(() => priced.lines.map((l) => l.materialId), [priced]);
  return (
    <Card title="Materials and current prices (₱)">
      <div className="table-wrap">
        <table className="tbl mat-table">
          <thead><tr><th>Item</th><th className="num">To buy</th><th className="num">Price per unit</th><th className="num">Cost</th></tr></thead>
          <tbody>
            {priced.lines.map((l) => (
              <tr key={l.id} className={l.reuse ? 'reused' : ''}>
                <td>
                  <div className="bold">{l.label}</div>
                  {l.note ? <div className="tiny muted">{l.note}</div> : null}
                  <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                    {l.basis === 'sourced' ? <Badge tone="green">Sourced price</Badge> : <Badge tone="orange">Estimate</Badge>}
                    {l.reuse ? <Badge tone="blue">{l.reuse.kind === 'onsite' ? 'Already on site' : `Reuse: ${l.reuse.label}`}</Badge> : null}
                  </div>
                  {l.reuse && l.reuse.kind === 'recycled' ? <div className="tiny" style={{ marginTop: 4 }}>{l.reuse.how}{l.reuse.coverage < 1 ? ` Covers about ${Math.round(l.reuse.coverage * 100)}%.` : ''}</div> : null}
                </td>
                <td className="num">{l.buyQty.toLocaleString('en-PH')} {l.unit}{l.reuse && l.buyQty !== l.qty ? <div className="tiny muted">of {l.qty.toLocaleString('en-PH')}</div> : null}</td>
                <td className="num"><PriceInput line={l} /><div className="tiny muted">{l.overridden ? 'your price' : `₱${l.unitMin.toLocaleString('en-PH')} – ₱${l.unitMax.toLocaleString('en-PH')} / ${l.unit}`}</div></td>
                <td className="num">{l.reuse && l.cost < l.fullCost ? <s className="muted tiny">{peso(l.fullCost)}</s> : null}<div className="bold">{peso(l.cost)}</div></td>
              </tr>
            ))}
            <tr>
              <td className="bold" colSpan={3}>Total to buy</td>
              <td className="num bold">{peso(priced.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="stack sm" style={{ marginTop: 12 }}>
        <p className="small">Likely range at the prices above: <b>{peso(priced.min)} to {peso(priced.max)}</b>. About {priced.estimateShare}% of this total rests on estimated prices.</p>
        {priced.saved > 0 ? <Alert tone="green" title={`You save about ${peso(priced.saved)} by reusing what you have`}>Buying everything new would cost {peso(priced.totalNew)}.</Alert> : null}
        {capital > 0 ? (
          over > 0
            ? <Alert tone="orange" title={`This build costs ${peso(over)} more than your ${peso(capital)} budget`}>Try the container design, tick more things you already have, or build in phases.</Alert>
            : <Alert tone="green" title={`Within your ${peso(capital)} budget`}>You would have about {peso(-over)} left for seedlings, tools and delivery.</Alert>
        ) : null}
        <p className="tiny muted">The planner&apos;s quick estimate for this plan is {peso(initialEstimate)}. This table is a detailed shopping list, so the two numbers can differ. Delivery and labour are not included.</p>
      </div>
      <SourceList ids={usedIds} />
    </Card>
  );
}
