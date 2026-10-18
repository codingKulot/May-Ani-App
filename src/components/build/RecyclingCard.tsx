import { useMemo } from 'react';
import { RECYCLABLES, recyclableById } from '@/data/recyclables';
import { peso } from '@/lib/format';
import { priceDesign, type BuildDesign } from '@/services/build/designs';
import { Alert, Card } from '@/components/ui';

interface Props {
  design: BuildDesign;
  selected: string[];
  onToggle: (id: string) => void;
  /** ids the AI says it can see in the photo */
  seen: string[];
  overrides: Record<string, number>;
  onSite: string[];
}

/** "What do you already have?" with the reuse technique and the pesos it saves for the chosen design. */
export function RecyclingCard({ design, selected, onToggle, seen, overrides, onSite }: Props) {
  const savings = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of RECYCLABLES) m.set(r.id, priceDesign(design, { overrides, recyclables: [r.id], onSite }).saved);
    return m;
  }, [design, overrides, onSite]);
  const chosen = selected.map((id) => recyclableById(id)).filter((r): r is NonNullable<typeof r> => !!r);

  return (
    <Card title="Recycle what you already have">
      <p className="small muted" style={{ marginBottom: 10 }}>Tick the things you have. The materials list updates and you get a how-to for each.</p>
      <div className="chips" role="group" aria-label="Things I already have">
        {RECYCLABLES.map((r) => {
          const on = selected.includes(r.id);
          const s = savings.get(r.id) ?? 0;
          return (
            <button key={r.id} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onToggle(r.id)} title={r.examples}>
              {r.emoji} {r.label}{s > 0 ? <span className="tiny"> · saves ≈ {peso(s)}</span> : null}{seen.includes(r.id) ? <span className="tiny"> · AI saw this</span> : null}
            </button>
          );
        })}
      </div>
      {chosen.length === 0 ? <p className="small muted" style={{ marginTop: 10 }}>Nothing ticked yet. Everything in the list is priced as bought new.</p> : (
        <div className="stack" style={{ marginTop: 12 }}>
          {chosen.map((r) => (
            <details key={r.id} className="tech" open>
              <summary className="bold">{r.emoji} {r.label}</summary>
              <p className="small muted" style={{ margin: '6px 0' }}>{r.examples}</p>
              {r.covers.length ? <ul className="small" style={{ margin: '0 0 8px', paddingLeft: 18 }}>{r.covers.map((c) => <li key={c.materialId}>{c.how}</li>)}</ul> : null}
              {r.techniques.map((t) => (
                <div key={t.title} style={{ marginBottom: 8 }}>
                  <div className="bold small">{t.title}</div>
                  <ol className="steps small" style={{ marginTop: 4 }}>{t.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
                </div>
              ))}
              {r.caution ? <Alert tone="orange" title="Safety">{r.caution}</Alert> : null}
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}
