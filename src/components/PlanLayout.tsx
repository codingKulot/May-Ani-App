import { catalogById } from '@/data/catalog';
import type { LayoutSpec } from '@/types';
import { CHART_COLORS } from './widgets';

const KIND_FILL: Record<string, string> = {
  pond: '#8fc7ea', house: '#d9b98a', run: '#cfe6b8', canal: '#6fb4e0', tank: '#4f9fd6', pump: '#9aa5ad', power: '#f2c94c', path: '#e9e2cf',
};

/** Top-down site plan drawn from a LayoutSpec (metres). Labels and the legend carry meaning, not colour alone. */
export function PlanLayout({ layout, showInfra = true }: { layout: LayoutSpec; showInfra?: boolean }) {
  const { widthM: W, lengthM: L, rects } = layout;
  // `u` = drawing unit scaled to the plot, so text/strokes look right from a 20 sqm garden to a 10 ha farm
  const u = Math.max(0.15, Math.max(W, L) / 30);
  const pad = u * 2.6;
  const vbW = W + pad * 2;
  const vbH = L + pad * 2 + u * 1.2;
  const colorFor = (itemId?: string) => {
    const idx = layout.legend.findIndex((l) => l.itemId === itemId);
    return CHART_COLORS[(idx < 0 ? 0 : idx) % CHART_COLORS.length];
  };
  const fs = u * 0.95;

  const tank = rects.find((r) => r.kind === 'tank');
  const canal = rects.find((r) => r.kind === 'canal');
  const prod = rects.filter((r) => r.kind === 'bed' || r.kind === 'pond' || r.kind === 'house');
  const minY = prod.length ? Math.min(...prod.map((r) => r.y)) : 0;

  return (
    <div className="stack sm">
      <svg
        className="plan-svg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        role="img"
        aria-label={`Site plan, ${W} by ${L} metres. ${layout.legend.map((l) => `${catalogById(l.itemId)?.name} ${l.areaSqm} square metres`).join(', ')}`}
      >
        <defs>
          <pattern id="hatch" width={u * 0.6} height={u * 0.6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={u * 0.6} stroke="#6b8f4a" strokeWidth={u * 0.1} />
          </pattern>
          <marker id="arr" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4Z" fill="#1c6fb8" /></marker>
        </defs>
        <g transform={`translate(${pad},${pad})`}>
          <rect x={0} y={0} width={W} height={L} fill="#f4f1e4" stroke="#7a8a7e" strokeWidth={u * 0.12} strokeDasharray={`${u * 0.6} ${u * 0.4}`} />

          {rects.map((r, i) => {
            const fill = r.kind === 'bed' ? colorFor(r.itemId) : KIND_FILL[r.kind];
            const op = r.kind === 'bed' ? 0.85 : 1;
            return (
              <g key={i}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={r.kind === 'tank' ? Math.min(r.w, r.h) / 2 : u * 0.15} fill={fill} fillOpacity={op} stroke="#2d4a37" strokeOpacity={0.5} strokeWidth={u * 0.07} />
                {r.kind === 'run' ? <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="url(#hatch)" /> : null}
                {(r.kind === 'pond' || r.kind === 'house' || r.kind === 'run') && r.w > u * 7 && r.h > u * 1.6 ? (
                  <text x={r.x + r.w / 2} y={r.y + r.h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill="#16301f" fontWeight={600}>{r.label}</text>
                ) : null}
                {r.kind === 'tank' ? <text x={r.x + r.w / 2} y={r.y + r.h / 2} fontSize={fs * 0.7} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontWeight={700}>Tank</text> : null}
                {r.kind === 'pump' ? <text x={r.x + r.w / 2} y={r.y + r.h / 2} fontSize={fs * 0.65} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontWeight={700}>P</text> : null}
                {r.kind === 'power' ? <text x={r.x + r.w / 2} y={r.y + r.h / 2} fontSize={fs * 0.8} textAnchor="middle" dominantBaseline="middle" fill="#3a2f00" fontWeight={700}>⚡</text> : null}
              </g>
            );
          })}

          {showInfra && tank && prod.length > 0 ? (
            <path d={`M${tank.x + tank.w} ${tank.y + tank.h / 2} H${W - 0.4} M${tank.x + tank.w / 2} ${tank.y + tank.h} V${Math.max(tank.y + tank.h + 0.1, minY - 0.25)} H${W - 0.4}`} fill="none" stroke="#1c6fb8" strokeWidth={u * 0.16} strokeDasharray={`${u * 0.6} ${u * 0.4}`} />
          ) : null}
          {showInfra && canal ? (
            <line x1={W * 0.15} y1={canal.y + canal.h / 2} x2={W * 0.85} y2={canal.y + canal.h / 2} stroke="#1c6fb8" strokeWidth={u * 0.14} markerEnd="url(#arr)" />
          ) : null}

          {/* dimensions */}
          <text x={W / 2} y={-u * 0.7} fontSize={u * 1.05} textAnchor="middle" fill="#3b4a40">{W} m</text>
          <text x={-u * 0.7} y={L / 2} fontSize={u * 1.05} textAnchor="middle" fill="#3b4a40" transform={`rotate(-90 ${-u * 0.7} ${L / 2})`}>{L} m</text>
          <text x={W / 2} y={L + u * 1.7} fontSize={u * 0.9} textAnchor="middle" fill="#1c6fb8" fontWeight={600}>↓ low side · drainage outlet</text>
          {/* north arrow */}
          <g transform={`translate(${W + u * 1.4},${u * 1.6}) scale(${u})`}>
            <path d="M0 0 L0.5 1.5 L0 1.1 L-0.5 1.5Z" fill="#14231a" />
            <text x={0} y={-0.2} fontSize={0.8} textAnchor="middle" fill="#14231a" fontWeight={700}>N</text>
          </g>
        </g>
      </svg>
      <div className="row wrap small" style={{ gap: 14 }}>
        {layout.legend.map((l) => (
          <span key={l.itemId} className="row" style={{ gap: 6 }}>
            <i style={{ width: 12, height: 12, borderRadius: 3, background: colorFor(l.itemId), display: 'inline-block' }} />
            {catalogById(l.itemId)?.name} · {l.areaSqm} sqm
          </span>
        ))}
        {rects.some((r) => r.kind === 'tank') ? <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 6, background: KIND_FILL.tank, display: 'inline-block' }} />Water tank</span> : null}
        <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 6, background: KIND_FILL.canal, display: 'inline-block' }} />Drainage canal</span>
      </div>
    </div>
  );
}
