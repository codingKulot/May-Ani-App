import { useEffect, useRef, useState } from 'react';
import { LuRuler, LuUndo2 } from 'react-icons/lu';
import { areaFromReference, polygonArea, type Pt } from '@/lib/geo';
import type { ImagePayload } from '@/lib/image';
import type { AppIcon } from '@/types';
import { Button, NumberInput } from './ui';

const RulerIcon: AppIcon = LuRuler;

/**
 * Two ways to measure land without a surveyor:
 *  - PhotoMeasure: top-down/aerial photo, set a scale from one known distance, then outline the area.
 *  - MapMeasure:   outline the area on an OpenStreetMap view (area computed from real coordinates).
 * Both are estimates; the UI says so.
 */

export function PhotoMeasure({ image, onUse }: { image: ImagePayload; onUse: (sqm: number) => void }) {
  const [mode, setMode] = useState<'scale' | 'outline'>('scale');
  const [ref, setRef] = useState<Pt[]>([]);
  const [poly, setPoly] = useState<Pt[]>([]);
  const [meters, setMeters] = useState(5);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => { setRef([]); setPoly([]); setMode('scale'); }, [image.dataUrl]);

  const point = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * image.width, y: ((e.clientY - r.top) / r.height) * image.height };
  };
  const click = (e: { clientX: number; clientY: number }) => {
    const p = point(e);
    if (mode === 'scale') {
      const next = ref.length >= 2 ? [p] : [...ref, p];
      setRef(next);
      if (next.length === 2) setMode('outline');
    } else {
      setPoly((a) => [...a, p]);
    }
  };

  const area = ref.length === 2 && poly.length >= 3 ? areaFromReference(poly, ref[0], ref[1], meters) : 0;
  const r = Math.max(4, image.width / 90);

  return (
    <div className="stack sm">
      <div className="small muted">
        {mode === 'scale'
          ? <><b>Step 1.</b> Tap the two ends of something you know the length of (a fence section, a door, a measured string).</>
          : <><b>Step 2.</b> Tap the corners of your area, in order. At least 3 points.</>}
      </div>
      <div className="measure">
        <img src={image.dataUrl} alt="Your land" />
        <svg ref={svgRef} className="overlay" viewBox={`0 0 ${image.width} ${image.height}`} onPointerDown={click} aria-label="Tap to place points">
          {poly.length >= 2 ? <polygon points={poly.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(34,160,90,.3)" stroke="#22a05a" strokeWidth={r / 2} /> : null}
          {ref.length === 2 ? <line x1={ref[0].x} y1={ref[0].y} x2={ref[1].x} y2={ref[1].y} stroke="#f2c94c" strokeWidth={r / 1.5} /> : null}
          {ref.map((p, i) => <circle key={`r${i}`} cx={p.x} cy={p.y} r={r} fill="#f2c94c" stroke="#000" strokeWidth={r / 4} />)}
          {poly.map((p, i) => <circle key={`p${i}`} cx={p.x} cy={p.y} r={r} fill="#fff" stroke="#22a05a" strokeWidth={r / 3} />)}
        </svg>
      </div>
      <div className="row wrap">
        <label className="small bold" htmlFor="refm">Real length of the yellow line (m)</label>
        <div style={{ width: 110 }}><NumberInput id="refm" value={meters} min={0.1} onChange={setMeters} /></div>
        <Button size="sm" variant="ghost" onClick={() => (poly.length ? setPoly((a) => a.slice(0, -1)) : setRef([]))}><LuUndo2 size={14} /> Undo</Button>
        <Button size="sm" variant="ghost" onClick={() => { setRef([]); setPoly([]); setMode('scale'); }}>Start over</Button>
      </div>
      {area > 0 ? (
        <div className="alert green">
          <RulerIcon className="ico" size={20} />
          <div className="grow">
            <h3>About {Math.round(area * 10) / 10} sqm</h3>
            <p>Works best with an overhead (top-down) photo. Angled photos give rough estimates only.</p>
            <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => onUse(Math.round(area))}>Use this area</Button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- map

const TILE = 256;
const worldPx = (lat: number, lon: number, z: number): Pt => {
  const n = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};
const fromWorldPx = (x: number, y: number, z: number) => {
  const n = TILE * 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lon };
};

/** Polygon area in sqm from lat/lon vertices (local equirectangular projection; fine at farm scale). */
export function geoPolygonAreaSqm(pts: { lat: number; lon: number }[]): number {
  if (pts.length < 3) return 0;
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const lon0 = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_540;
  return polygonArea(pts.map((p) => ({ x: (p.lon - lon0) * kx, y: (p.lat - lat0) * ky })));
}

export function MapMeasure({ lat, lon, onUse }: { lat: number; lon: number; onUse: (sqm: number) => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 320, h: 320 });
  const [center, setCenter] = useState({ lat, lon });
  const [zoom, setZoom] = useState(17);
  const [pts, setPts] = useState<{ lat: number; lon: number }[]>([]);
  const drag = useRef<{ x: number; y: number; moved: boolean; cx: number; cy: number } | null>(null);

  useEffect(() => { setCenter({ lat, lon }); }, [lat, lon]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const c = worldPx(center.lat, center.lon, zoom);
  const left = c.x - size.w / 2;
  const top = c.y - size.h / 2;
  const toScreen = (p: { lat: number; lon: number }) => {
    const w = worldPx(p.lat, p.lon, zoom);
    return { x: w.x - left, y: w.y - top };
  };

  const x0 = Math.floor(left / TILE);
  const x1 = Math.floor((left + size.w) / TILE);
  const y0 = Math.floor(top / TILE);
  const y1 = Math.floor((top + size.h) / TILE);
  // `px` = unwrapped column (for positioning), `x` = wrapped column (for the tile URL)
  const tiles: { px: number; x: number; y: number }[] = [];
  const maxT = 2 ** zoom;
  for (let ty = Math.max(0, y0); ty <= Math.min(maxT - 1, y1); ty++) for (let tx = x0; tx <= x1; tx++) tiles.push({ px: tx, x: ((tx % maxT) + maxT) % maxT, y: ty });

  const area = geoPolygonAreaSqm(pts);

  const down = (e: any) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false, cx: c.x, cy: c.y };
  };
  const move = (e: any) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
    if (d.moved) setCenter(fromWorldPx(d.cx - dx, d.cy - dy, zoom));
  };
  const up = (e: any) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const r = box.current!.getBoundingClientRect();
    const p = fromWorldPx(left + (e.clientX - r.left), top + (e.clientY - r.top), zoom);
    setPts((a) => [...a, p]);
  };

  return (
    <div className="stack sm">
      <div className="small muted">Drag to move the map, then tap each corner of your land. Use + / − to zoom in for accuracy.</div>
      <div
        ref={box}
        className="map-box"
        role="application"
        aria-label="Map: tap to outline your land"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onWheel={(e) => setZoom((z) => Math.max(3, Math.min(19, z + (e.deltaY < 0 ? 1 : -1))))}
      >
        {tiles.map((t) => (
          <img
            key={`${zoom}/${t.px}/${t.y}`}
            className="tile"
            alt=""
            draggable={false}
            src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
            style={{ left: t.px * TILE - left, top: t.y * TILE - top }}
            onError={(e) => { (e.currentTarget as HTMLElement).style.visibility = 'hidden'; }}
          />
        ))}
        <svg className="overlay" aria-hidden="true">
          {pts.length >= 2 ? <polygon points={pts.map((p) => { const s = toScreen(p); return `${s.x},${s.y}`; }).join(' ')} fill="rgba(34,160,90,.3)" stroke="#16803f" strokeWidth={2.5} /> : null}
          {pts.map((p, i) => { const s = toScreen(p); return <circle key={i} cx={s.x} cy={s.y} r={6} fill="#fff" stroke="#16803f" strokeWidth={3} />; })}
        </svg>
        <div className="map-ctl" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(19, z + 1))}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(3, z - 1))}>−</button>
        </div>
        <div className="map-attr">© OpenStreetMap contributors</div>
      </div>
      <div className="row wrap">
        <Button size="sm" variant="ghost" onClick={() => setPts((a) => a.slice(0, -1))}><LuUndo2 size={14} /> Undo</Button>
        <Button size="sm" variant="ghost" onClick={() => setPts([])}>Clear</Button>
        {area > 0 ? <span className="bold">≈ {Math.round(area).toLocaleString()} sqm</span> : <span className="muted small">Tap at least 3 corners</span>}
        <span className="grow" />
        <Button size="sm" disabled={area <= 0} onClick={() => onUse(Math.round(area))}>Use this area</Button>
      </div>
    </div>
  );
}
