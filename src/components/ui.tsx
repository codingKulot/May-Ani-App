import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { num, parseNumber } from '@/lib/format';
import { LuCircleAlert, LuInfo, LuShieldAlert, LuTriangleAlert, LuX } from 'react-icons/lu';
import type { AppIcon } from '@/types';

export function PageHeader(p: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="grow">
        <h1>{p.title}</h1>
        {p.sub ? <p>{p.sub}</p> : null}
      </div>
      {p.actions ? <div className="actions">{p.actions}</div> : null}
    </div>
  );
}

export function Card(p: { children?: ReactNode; className?: string; tint?: boolean; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`card ${p.tint ? 'tint' : ''} ${p.className ?? ''}`}>
      {p.title ? (
        <div className="card-title">
          <h2>{p.title}</h2>
          {p.action}
        </div>
      ) : null}
      {p.children}
    </section>
  );
}

type BtnProps = {
  children?: ReactNode;
  onClick?: (e: any) => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  block?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  className?: string;
};

export function Button(p: BtnProps) {
  const cls = [
    'btn',
    p.variant && p.variant !== 'primary' ? p.variant : '',
    p.size === 'sm' ? 'sm' : '',
    p.block ? 'block' : '',
    p.className ?? '',
  ].join(' ');
  return (
    <button type={p.type ?? 'button'} className={cls} onClick={p.onClick} disabled={p.disabled} title={p.title}>
      {p.children}
    </button>
  );
}

export function LinkButton(p: { to: string; children?: ReactNode; variant?: BtnProps['variant']; size?: BtnProps['size']; block?: boolean }) {
  const cls = ['btn', p.variant && p.variant !== 'primary' ? p.variant : '', p.size === 'sm' ? 'sm' : '', p.block ? 'block' : ''].join(' ');
  return (
    <a className={cls} href={`#${p.to}`}>
      {p.children}
    </a>
  );
}

export function Tabs<T extends string>(p: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {p.tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={p.value === t.id} className={`tab ${p.value === t.id ? 'on' : ''}`} onClick={() => p.onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Pills<T extends string>(p: { items: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="pills">
      {p.items.map((t) => (
        <button key={t.id} className={`pill ${p.value === t.id ? 'on' : ''}`} aria-pressed={p.value === t.id} onClick={() => p.onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Field(p: { label: string; hint?: ReactNode; children?: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={p.htmlFor}>{p.label}</label>
      {p.children}
      {p.hint ? <span className="hint">{p.hint}</span> : null}
    </div>
  );
}

export function Chips<T extends string>(p: { items: { id: T; label: string; icon?: ReactNode }[]; value: T; onChange: (id: T) => void; seg?: boolean }) {
  return (
    <div className={p.seg ? 'seg' : 'chips'} role="radiogroup">
      {p.items.map((i) => (
        <button key={i.id} type="button" role="radio" aria-checked={p.value === i.id} className={`chip ${p.value === i.id ? 'on' : ''}`} onClick={() => p.onChange(i.id)}>
          {i.icon}
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Badge(p: { children?: ReactNode; tone?: 'red' | 'orange' | 'blue' | 'gray' | 'green' }) {
  return <span className={`badge ${p.tone && p.tone !== 'green' ? p.tone : ''}`}>{p.children}</span>;
}

export function Alert(p: { tone: 'red' | 'orange' | 'blue' | 'green'; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon: AppIcon = p.tone === 'red' ? LuShieldAlert : p.tone === 'orange' ? LuTriangleAlert : p.tone === 'blue' ? LuInfo : LuCircleAlert;
  return (
    <div className={`alert ${p.tone}`} role={p.tone === 'red' ? 'alert' : 'note'}>
      <Icon className="ico" size={22} />
      <div className="grow">
        <h3>{p.title}</h3>
        {p.children ? <div className="alert-body">{p.children}</div> : null}
        {p.action}
      </div>
    </div>
  );
}

export function Stat(p: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'red' | 'green' | 'blue' | 'orange'; icon?: ReactNode }) {
  return (
    <div className={`stat ${p.tone ?? ''}`}>
      <div className="k">
        {p.icon}
        {p.label}
      </div>
      <div className="v">{p.value}</div>
      {p.sub ? <div className="s">{p.sub}</div> : null}
    </div>
  );
}

export function Progress(p: { value: number; warn?: boolean; label?: string }) {
  const v = Math.max(0, Math.min(100, p.value));
  return (
    <div className={`progress ${p.warn ? 'warn' : ''}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={p.label}>
      <i style={{ width: `${v}%` }} />
    </div>
  );
}

export function Empty(p: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{p.icon ?? '🌱'}</div>
      <div className="bold">{p.title}</div>
      {p.children ? <p className="small" style={{ marginTop: 4 }}>{p.children}</p> : null}
      {p.action ? <div style={{ marginTop: 12 }}>{p.action}</div> : null}
    </div>
  );
}

export const Spinner = () => <span className="spinner" role="status" aria-label="Loading" />;

export function Sheet(p: { open: boolean; onClose: () => void; title: string; children?: ReactNode }) {
  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: { key: string }) => e.key === 'Escape' && p.onClose();
    window.addEventListener('keydown', onKey as any);
    return () => window.removeEventListener('keydown', onKey as any);
  }, [p.open]);
  if (!p.open) return null;
  return (
    <div className="sheet-backdrop" onClick={p.onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>{p.title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={p.onClose}><LuX size={20} /></button>
        </div>
        {p.children}
      </div>
    </div>
  );
}

export const Avatar = ({ name, lg }: { name: string; lg?: boolean }) => (
  <span className={`avatar ${lg ? 'lg' : ''}`} aria-hidden="true">{(name.trim()[0] ?? '?').toUpperCase()}</span>
);

// ---------- toast (tiny global) ----------
let setToastMsg: ((m: string | null) => void) | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  setToastMsg?.(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setToastMsg?.(null), 2800);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setToastMsg = setMsg; return () => { setToastMsg = null; }; }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

/**
 * Number box that keeps the user's own text, so they can clear and retype freely. Accepts "1,500" and "₱1,500.50"
 * (a type="number" box treats those as empty). Something that is not a number counts as 0 and says so under the box;
 * min and max are pointed out once the user leaves the box (forms still check them before saving).
 */
export function NumberInput(p: { value: number; onChange: (n: number) => void; min?: number; max?: number; id?: string; placeholder?: string; 'aria-label'?: string }) {
  const [text, setText] = useState(Number.isFinite(p.value) && p.value !== 0 ? String(p.value) : '');
  const [left, setLeft] = useState(false);
  const reported = useRef(p.value);
  useEffect(() => {
    // A change from outside (e.g. the area measured on the map) replaces the text; our own reports do not, so typing is never undone.
    if (p.value !== reported.current) {
      reported.current = p.value;
      setText(p.value ? String(p.value) : '');
    }
  }, [p.value]);
  const n = parseNumber(text);
  const problem = text.trim() === '' ? ''
    : Number.isNaN(n) ? 'Type a number, like 1,500'
      : left && p.min !== undefined && n < p.min ? `Use ${num(p.min, 2)} or more`
        : left && p.max !== undefined && n > p.max ? `Use ${num(p.max, 2)} or less` : '';
  const errId = p.id ? `${p.id}-problem` : undefined;
  return (
    <>
      <input
        id={p.id}
        className="input"
        inputMode="decimal"
        type="text"
        autoComplete="off"
        value={text}
        placeholder={p.placeholder}
        aria-label={p['aria-label']}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? errId : undefined}
        onBlur={() => setLeft(true)}
        onFocus={() => setLeft(false)}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseNumber(e.target.value);
          reported.current = Number.isNaN(v) ? 0 : v;
          p.onChange(reported.current);
        }}
      />
      {problem ? <span id={errId} className="field-error">{problem}</span> : null}
    </>
  );
}
