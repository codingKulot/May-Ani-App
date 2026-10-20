import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { num, parseNumber } from '@/lib/format';
import { LuCheck, LuCircleAlert, LuInfo, LuShieldAlert, LuTriangleAlert, LuX } from 'react-icons/lu';
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

/** Like Chips, but any number can be on (each one is a toggle button). */
export function ToggleChips<T extends string>(p: { items: { id: T; label: string; icon?: ReactNode }[]; value: readonly T[]; onToggle: (id: T) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={p.label}>
      {p.items.map((i) => {
        const on = p.value.includes(i.id);
        return (
          <button key={i.id} type="button" aria-pressed={on} className={`chip ${on ? 'on' : ''}`} onClick={() => p.onToggle(i.id)}>
            {on ? <LuCheck size={16} /> : i.icon}
            {i.label}
          </button>
        );
      })}
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

// ---------- dialogs ----------
/** Dialogs open right now, newest last: only the top one answers Escape and keeps Tab inside (a confirm can open over a form). */
const openSheets: symbol[] = [];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside the dialog, so keyboard users cannot wander into the page behind it. */
function keepTabInside(e: KeyboardEvent, box: HTMLElement) {
  const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const at = document.activeElement;
  if (e.shiftKey && (at === first || at === box)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (at === last || !box.contains(at))) { e.preventDefault(); first.focus(); }
}

/**
 * A dialog: a sheet from the bottom on phones, a centered box on bigger screens (centered on the page content, beside the
 * sidebar, on desktop: see .sheet-backdrop in styles.css). Escape, the X and a tap outside close it. While open, the page
 * behind does not scroll; focus moves into the dialog and goes back to where it was afterwards.
 */
export function Sheet(p: { open: boolean; onClose: () => void; title: string; children?: ReactNode; size?: 'sm'; alert?: boolean }) {
  const box = useRef<HTMLDivElement | null>(null);
  const onClose = useRef(p.onClose);
  onClose.current = p.onClose;
  useEffect(() => {
    if (!p.open) return;
    const me = Symbol('dialog');
    openSheets.push(me);
    const before = document.activeElement as HTMLElement | null;
    document.body.classList.add('sheet-open');
    box.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (openSheets[openSheets.length - 1] !== me) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose.current(); }
      else if (e.key === 'Tab' && box.current) keepTabInside(e, box.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openSheets.splice(openSheets.indexOf(me), 1);
      if (!openSheets.length) document.body.classList.remove('sheet-open');
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [p.open]);
  if (!p.open) return null;
  return (
    <div className="sheet-backdrop" onClick={p.onClose}>
      <div ref={box} tabIndex={-1} className={`sheet ${p.size === 'sm' ? 'small' : ''}`} role={p.alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>{p.title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={p.onClose}><LuX size={20} /></button>
        </div>
        {p.children}
      </div>
    </div>
  );
}

/** A yes/no question for askConfirm. `message` may contain line breaks (\n). */
export interface ConfirmOptions { title: string; message?: string; ok: string; cancel?: string; danger?: boolean }

let showConfirm: ((o: ConfirmOptions, answer: (yes: boolean) => void) => void) | null = null;

/**
 * Asks a yes/no question in the app's own dialog (instead of the browser's confirm(), which shows "localhost says" at the top
 * of the window and cannot be styled). True for the OK button; false for Cancel, the X, Escape or a tap outside.
 */
export function askConfirm(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (showConfirm) showConfirm(o, resolve);
    else resolve(window.confirm([o.title, o.message].filter(Boolean).join('\n\n'))); // ConfirmHost not on screen (should not happen)
  });
}

/** Shows askConfirm's questions. Rendered once, in App, so it works on every screen (also Welcome, without the sidebar). */
export function ConfirmHost() {
  const [q, setQ] = useState<ConfirmOptions | null>(null);
  const answer = useRef<((yes: boolean) => void) | null>(null);
  useEffect(() => {
    showConfirm = (o, done) => {
      answer.current?.(false); // a newer question replaces an unanswered one
      answer.current = done;
      setQ(o);
    };
    return () => { showConfirm = null; };
  }, []);
  const reply = (yes: boolean) => {
    answer.current?.(yes);
    answer.current = null;
    setQ(null);
  };
  return (
    <Sheet open={!!q} onClose={() => reply(false)} title={q?.title ?? ''} size="sm" alert>
      {q ? (
        <div className="stack">
          {q.message ? <p className="confirm-text">{q.message}</p> : null}
          <div className="confirm-actions">
            <Button variant="secondary" onClick={() => reply(false)}>{q.cancel ?? 'Cancel'}</Button>
            <Button variant={q.danger ? 'danger' : 'primary'} onClick={() => reply(true)}>{q.ok}</Button>
          </div>
        </div>
      ) : null}
    </Sheet>
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
