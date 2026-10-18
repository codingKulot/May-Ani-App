import { LuPrinter } from 'react-icons/lu';
import { M_TO_FT, type BuildDesign } from '@/services/build/designs';
import { Button, Card } from '@/components/ui';

const ft = (m: number) => `${(Math.round(m * M_TO_FT * 10) / 10).toLocaleString('en-PH')} ft`;

/** Numbered build instructions with every measurement, plus the cut list. */
export function BuildSteps({ design }: { design: BuildDesign }) {
  return (
    <Card title="How to build it, step by step" action={<Button size="sm" variant="ghost" onClick={() => window.print()}><LuPrinter size={14} /> Print</Button>}>
      <ol className="build-steps">
        {design.steps.map((s, i) => (
          <li key={i}>
            <div className="bold">{s.title}</div>
            <div className="stack sm small" style={{ marginTop: 4 }}>
              {s.lines.map((l, j) => <p key={j}>{l}</p>)}
              {s.table ? (
                <div className="table-wrap">
                  <table className="tbl compact">
                    <thead><tr>{s.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{s.table.rows.map((r, k) => <tr key={k}>{r.map((c, m) => <td key={m}>{c}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {design.cutList.length ? (
        <details className="small" style={{ marginTop: 12 }}>
          <summary className="bold" style={{ cursor: 'pointer' }}>Full cut list</summary>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="tbl compact">
              <thead><tr><th>Part</th><th>Section</th><th className="num">Qty</th><th className="num">Length</th></tr></thead>
              <tbody>{design.cutList.map((c, i) => <tr key={i}><td>{c.part}{c.note ? <span className="tiny muted"> · {c.note}</span> : null}</td><td>{c.section}</td><td className="num">{c.qty}</td><td className="num">{c.lengthM} m ({ft(c.lengthM)})</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      ) : null}
      {design.notes.map((n, i) => <p key={i} className="disclaimer" style={{ marginTop: 10 }}>{n}</p>)}
    </Card>
  );
}
