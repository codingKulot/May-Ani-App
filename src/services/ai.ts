import { getState } from '@/core/store';
import type { DiagnosisResult, HealthKind, Sector, SiteConditions } from '@/types';
import type { ImagePayload } from '@/lib/image';
import { isValidQuad, type Quad } from '@/services/build/geometry';
import { sessionToken } from './auth'; // auth.ts imports this file too; sessionToken is only read when a call is made, so that is fine

/**
 * Client for the optional May-Ani server (server/, see docs/ARCHITECTURE.md). The server holds the Anthropic API key,
 * so no secret ever ships to the browser. Every feature degrades gracefully when it is unreachable.
 */

export interface ServerStatus {
  ai: boolean;
  chat: boolean;
  /** sign-up and log-in work (the server has a MongoDB address) */
  accounts?: boolean;
  model?: string;
  /** which image model is set up on the server for realistic pictures, if any */
  render?: 'gemini' | 'openai';
  /** AI uses per account per day */
  daily?: { ai: number; pictures: number };
}

/** The login for calls that need one (AI and chat: May-Ani is for logged-in users only). */
function loginHeader(): Record<string, string> {
  const token = sessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
const paidHeaders = loginHeader;

/**
 * Where the May-Ani server lives. Blank setting = same origin (when the server also serves the app).
 * While developing with `bun run dev` (port 3000) there is no server on that origin, so look at the
 * default server port instead, so AI works without touching Settings.
 */
export const DEV_SERVER = 'http://localhost:8787';
const onDevPort = () => typeof location !== 'undefined' && location.port === '3000' && location.hostname === 'localhost';
const apiBase = () => getState().settings.apiBase.trim().replace(/\/$/, '') || (onDevPort() ? DEV_SERVER : '');

/**
 * A refusal from the server: `status` is the HTTP code, `field` names the form field to fix when the server knows it,
 * `code` says why an AI call failed (for example `ai_billing` when the AI account has no credit).
 */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly field?: string, readonly code?: string) {
    super(message);
  }
}

export async function call<T>(path: string, init?: RequestInit, timeoutMs = 60_000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(body?.error ?? `Server error ${res.status}`, res.status, typeof body?.field === 'string' ? body.field : undefined,
        typeof body?.code === 'string' ? body.code : undefined);
    }
    return body as T;
  } finally {
    clearTimeout(t);
  }
}

let statusCache: { at: number; value: ServerStatus | null } | null = null;

/** null = server not reachable. Cached for 30 s. */
export async function serverStatus(force = false): Promise<ServerStatus | null> {
  if (!force && statusCache && Date.now() - statusCache.at < 30_000) return statusCache.value;
  let value: ServerStatus | null = null;
  try {
    value = await call<ServerStatus>('/api/health', undefined, 4000);
  } catch {
    value = null;
  }
  statusCache = { at: Date.now(), value };
  return value;
}

/** What a health photo shows, as the AI judged it. Keep in sync with PHOTO_SUBJECTS in server/shared.mjs (tests/health-ai.test.ts checks). */
export const PHOTO_SUBJECTS = ['plant', 'animal', 'fish', 'farm', 'other', 'unclear'] as const;
export type PhotoSubject = (typeof PHOTO_SUBJECTS)[number];

/** The AI's answer to a health check. `subject` is missing only if the AI did not say. */
export interface AiCheck {
  subject?: PhotoSubject;
  /** one sentence on what the whole photo shows */
  seen: string;
  results: DiagnosisResult[];
}

export async function aiDiagnose(req: {
  kind: HealthKind;
  subject?: string;
  description: string;
  image?: ImagePayload;
  place?: string;
}): Promise<AiCheck> {
  const body = {
    kind: req.kind,
    subject: req.subject,
    description: req.description,
    place: req.place,
    image: req.image ? { mediaType: req.image.mediaType, data: req.image.data } : undefined,
  };
  const out = await call<{ subject?: string; seen?: string; results?: Omit<DiagnosisResult, 'source'>[] }>(
    '/api/ai/diagnose', { method: 'POST', body: JSON.stringify(body), headers: paidHeaders() }, 100_000);
  return {
    subject: (PHOTO_SUBJECTS as readonly string[]).includes(out.subject ?? '') ? (out.subject as PhotoSubject) : undefined,
    seen: typeof out.seen === 'string' ? out.seen : '',
    results: (Array.isArray(out.results) ? out.results : []).map((r) => ({ ...r, source: 'ai' as const })),
  };
}

/** Why an AI call failed, in words for the farmer. `code` is the server's reason, or `ai_offline` / `ai_timeout` when the server could not be reached. */
export function aiProblem(e: unknown): { code: string; text: string } {
  if (e instanceof ApiError) return { code: e.code ?? (e.status === 501 ? 'ai_off' : 'ai_error'), text: e.message };
  if ((e as Error)?.name === 'AbortError') return { code: 'ai_timeout', text: 'The AI took too long to answer. Please try again.' };
  return { code: 'ai_offline', text: 'The May-Ani server could not be reached. Check your internet connection, or that the server is running.' };
}

export interface SiteAnalysis {
  notes: string[];
  site: Partial<SiteConditions>;
  estimatedAreaSqm?: number;
}

export async function aiSiteAnalysis(req: { sectors: Sector[]; images: ImagePayload[] }): Promise<SiteAnalysis> {
  return call<SiteAnalysis>('/api/ai/site', {
    method: 'POST',
    body: JSON.stringify({
      // every chosen type, e.g. "crops+fruits+fish" (the server reads up to 60 letters)
      sector: req.sectors.join('+'),
      images: req.images.map((i) => ({ mediaType: i.mediaType, data: i.data })),
    }),
    headers: paidHeaders(),
  });
}

export interface SiteSurvey {
  /** floor corners (0..1 of the photo): far-left, far-right, near-right, near-left. Only present if the AI's answer was geometrically valid. */
  floorQuad?: Quad;
  surface?: 'soil' | 'hard' | 'gravel' | 'mixed';
  widthM?: number;
  lengthM?: number;
  sunlight?: 'full' | 'partial' | 'shaded';
  onSite: string[];
  reusable: string[];
  notes: string[];
}

/** Claude reads one site photo for the build studio. The result is advisory: the user can still move the corners. */
export async function aiSiteSurvey(image: ImagePayload): Promise<SiteSurvey> {
  const raw = await call<Omit<SiteSurvey, 'floorQuad'> & { floorQuad?: number[][] }>('/api/ai/survey', {
    method: 'POST',
    body: JSON.stringify({ image: { mediaType: image.mediaType, data: image.data } }),
    headers: paidHeaders(),
  }, 90_000);
  const q = Array.isArray(raw.floorQuad) && raw.floorQuad.length === 4 ? (raw.floorQuad.map(([x, y]) => ({ x, y })) as Quad) : undefined;
  return { ...raw, floorQuad: isValidQuad(q) ? q : undefined, onSite: raw.onSite ?? [], reusable: raw.reusable ?? [], notes: raw.notes ?? [] };
}

/** Asks the server's image model to draw the finished garden onto the user's photo. Returns a data URL. Takes up to a couple of minutes. */
export async function aiRenderPicture(image: ImagePayload, prompt: string): Promise<string> {
  const out = await call<{ image?: { mediaType: string; data: string } }>('/api/ai/render', {
    method: 'POST',
    body: JSON.stringify({ image: { mediaType: image.mediaType, data: image.data }, prompt }),
    headers: paidHeaders(),
  }, 170_000);
  if (!out.image?.data) throw new Error('No picture came back. Please try again.');
  return `data:${out.image.mediaType};base64,${out.image.data}`;
}

export interface DirectoryUser { id: string; name: string; role: string; blurb: string }
export interface ServerMessage { id: string; from: string; to: string; text: string; at: string }

/** Chat on the server (server/chat.mjs). Every call carries the account login: only logged-in users can chat. */
export const chatApi = {
  /** Joins (or updates) the logged-in user. The server answers with their chat id, the same on every phone. */
  register: async (u: { blurb: string }) =>
    (await call<{ ok: true; id: string }>('/api/chat/register', { method: 'POST', body: JSON.stringify(u), headers: loginHeader() })).id,
  directory: () => call<{ users: DirectoryUser[] }>('/api/chat/directory', { headers: loginHeader() }),
  /** The last messages, and how far this account has read each conversation (`reads`: contact id -> time, on any phone). */
  history: () => call<{ messages: ServerMessage[]; reads?: Record<string, string> }>('/api/chat/history', { headers: loginHeader() }),
  /** Marks a conversation read up to `at` for this account on every phone; answers the account's mark (never older). */
  read: (r: { with: string; at: string }) =>
    call<{ with: string; at: string }>('/api/chat/read', { method: 'POST', body: JSON.stringify(r), headers: loginHeader() }),
  send: (m: { to: string; text: string }) =>
    call<{ id: string; at: string }>('/api/chat/send', { method: 'POST', body: JSON.stringify(m), headers: loginHeader() }),
  /**
   * The web address of the live message stream. The browser's EventSource cannot send the login, so the server gives a
   * one-time ticket for it (valid one minute): the login token itself never goes into a web address.
   */
  streamUrl: async () => {
    const { ticket } = await call<{ ticket: string }>('/api/chat/ticket', { method: 'POST', headers: loginHeader() });
    return `${apiBase()}/api/chat/stream?ticket=${encodeURIComponent(ticket)}`;
  },
};
