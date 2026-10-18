const phpFmt = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });
const phpFmt2 = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const peso = (n: number): string => `₱${phpFmt.format(Math.round(n))}`;
export const peso2 = (n: number): string => `₱${phpFmt2.format(n)}`;
export const num = (n: number, d = 0): string =>
  new Intl.NumberFormat('en-PH', { maximumFractionDigits: d }).format(n);

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Reads a number the way people type it: "1500", "1,500", "₱ 1,500.50", "PHP 250", "1 500".
 * Commas are thousands separators (Philippine style), the dot is the decimal point. NaN when it is not a number.
 */
export function parseNumber(text: string): number {
  const t = text.trim().replace(/^php/i, '').replace(/[₱,\s]/g, '');
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
}

/** yyyy-mm-dd in the user's local time zone. */
export function isoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ''; // no date (an emptied date field)
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'No date'; // never "Invalid Date" on screen
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : `${d}d`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
