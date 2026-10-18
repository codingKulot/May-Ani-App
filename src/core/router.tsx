import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/** Tiny hash router: #/path/:param?query=1 . Zero dependencies, works offline and on any static host. */

export interface RouteMatch {
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface RouteDef {
  pattern: string;
  render: (m: RouteMatch) => ReactNode;
}

function parseHash(): { path: string; query: Record<string, string> } {
  const raw = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query: Record<string, string> = {};
  new URLSearchParams(qs).forEach((v, k) => (query[k] = v));
  return { path: path || '/', query };
}

export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean);
  const xp = path.split('/').filter(Boolean);
  if (pp.length !== xp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(xp[i]);
    else if (pp[i] !== xp[i]) return null;
  }
  return params;
}

export function useHash(): { path: string; query: Record<string, string> } {
  const [h, setH] = useState(parseHash);
  useEffect(() => {
    const on = () => setH(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return h;
}

export function navigate(to: string) {
  if (location.hash === `#${to}`) return;
  location.hash = to;
}

export function back(fallback = '/') {
  if (history.length > 1) history.back();
  else navigate(fallback);
}

export function Link(props: { to: string; className?: string; children?: ReactNode; title?: string }) {
  return (
    <a href={`#${props.to}`} className={props.className} title={props.title}>
      {props.children}
    </a>
  );
}

export function Router({ routes, notFound }: { routes: RouteDef[]; notFound: ReactNode }) {
  const { path, query } = useHash();
  for (const r of routes) {
    const params = matchRoute(r.pattern, path);
    if (params) return <>{r.render({ path, params, query })}</>;
  }
  return <>{notFound}</>;
}
