import { useRef } from 'react';
import type { StoredPhoto } from '@/lib/photoStore';
import { isValidQuad, type Quad } from '@/services/build/geometry';
import type { Prim, Scene } from '@/services/build/render';

const CORNER_NAMES = ['far-left', 'far-right', 'near-right', 'near-left'] as const;

function PrimEl({ p }: { p: Prim }) {
  if (p.k === 'poly') return <polygon points={p.pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')} fill={p.fill} fillOpacity={p.opacity} stroke={p.stroke} strokeWidth={p.sw} strokeLinejoin="round" />;
  if (p.k === 'line') return <line x1={p.a.x} y1={p.a.y} x2={p.b.x} y2={p.b.y} stroke={p.stroke} strokeWidth={p.sw} strokeOpacity={p.opacity} strokeDasharray={p.dash} strokeLinecap="round" />;
  return <ellipse cx={p.c.x} cy={p.c.y} rx={p.rx} ry={p.ry} fill={p.fill} fillOpacity={p.opacity} stroke={p.stroke} strokeWidth={p.sw} />;
}

export interface PhotoSceneProps {
  photo: StoredPhoto;
  /** drawing primitives from renderScene(); computed by the parent so the legend and thumbnails share it */
  scene: Scene;
  quad: Quad;
  /** show only the original photo */
  showOriginal?: boolean;
  /** show draggable corner handles */
  editing?: boolean;
  onQuadChange?: (q: Quad) => void;
  /** small card version: no markers or handles */
  compact?: boolean;
  label?: string;
}

/** The user's own photo with the planned garden drawn in perspective on the floor area they marked. */
export function PhotoScene({ photo, scene, quad, showOriginal, editing, onQuadChange, compact, label }: PhotoSceneProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const { width: W, height: Hh } = photo;
  const outline = quad.map((p) => `${p.x * W},${p.y * Hh}`).join(' ');
  const hr = W * 0.022;

  const move = (i: number, nx: number, ny: number) => {
    if (!onQuadChange) return;
    const next = quad.map((p, k) => (k === i ? { x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)) } : p)) as Quad;
    if (isValidQuad(next)) onQuadChange(next);
  };
  const toNorm = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  return (
    <svg
      ref={svgRef}
      className="scene-svg"
      viewBox={`0 0 ${W} ${Hh}`}
      preserveAspectRatio={compact ? 'xMidYMax slice' : 'xMidYMid meet'}
      role="img"
      aria-label={label ?? (showOriginal ? 'Your original site photo' : 'Concept preview of the garden drawn on your site photo')}
    >
      <image href={photo.dataUrl} width={W} height={Hh} />
      {!showOriginal ? scene.prims.map((p, i) => <PrimEl key={i} p={p} />) : null}
      {!showOriginal && !compact ? scene.markers.map((m) => (
        <g key={m.n} aria-hidden="true">
          <circle cx={m.at.x} cy={m.at.y} r={W * 0.019} fill="#14532d" stroke="#fff" strokeWidth={2} />
          <text x={m.at.x} y={m.at.y} fontSize={W * 0.022} fill="#fff" fontWeight={700} textAnchor="middle" dominantBaseline="central">{m.n}</text>
        </g>
      )) : null}
      {editing && !compact ? (
        <g>
          <polygon points={outline} fill="none" stroke="#fff" strokeWidth={3} strokeDasharray="14 9" />
          <polygon points={outline} fill="none" stroke="#14532d" strokeWidth={1.5} strokeDasharray="14 9" />
          {quad.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x * W} cy={p.y * Hh} r={hr} fill="#22c55e" stroke="#fff" strokeWidth={3}
                className="scene-handle" tabIndex={0} role="button"
                aria-label={`Move the ${CORNER_NAMES[i]} corner. Drag it, or focus it and use the arrow keys.`}
                onPointerDown={(e) => { drag.current = i; (e.target as Element).setPointerCapture(e.pointerId); e.preventDefault(); }}
                onPointerMove={(e) => { if (drag.current === i) { const n = toNorm(e); move(i, n.x, n.y); } }}
                onPointerUp={() => { drag.current = null; }}
                onPointerCancel={() => { drag.current = null; }}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.05 : 0.01;
                  const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                  const v = d[e.key];
                  if (v) { e.preventDefault(); move(i, p.x + v[0], p.y + v[1]); }
                }}
              />
              <text x={p.x * W} y={p.y * Hh} fontSize={hr * 0.95} fill="#fff" fontWeight={700} textAnchor="middle" dominantBaseline="central" pointerEvents="none">{i + 1}</text>
            </g>
          ))}
        </g>
      ) : null}
    </svg>
  );
}
