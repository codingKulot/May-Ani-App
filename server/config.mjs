// All server settings in one place. They are read once from the environment (and the .env file), checked, and handed to the
// parts that need them; no other server file reads process.env. Secrets (API keys, the MongoDB address, the Gmail app password)
// stay in this object and are never printed.

import { existsSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envCount, parseTrustProxy } from './limits.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env reader (no dependency): KEY=value lines go into `env`. Real environment variables win over the file. */
export function loadEnvFile(file = path.join(ROOT, '.env'), env = process.env) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (v && env[m[1]] === undefined) env[m[1]] = v;
  }
}

const text = (v) => String(v ?? '').trim();
const base = (v, fallback) => (text(v) || fallback).replace(/\/$/, '');
const positive = (v, fallback) => Number(v) || fallback;

/**
 * The settings from `env` (pass process.env after loadEnvFile; tests pass their own object, so they never see the owner's
 * .env). Answers { config, problems }: `problems` are plain sentences; the server does not start while there are any.
 */
export function loadConfig(env) {
  const problems = [];
  const port = Number(text(env.PORT) || 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) problems.push(`PORT must be a whole number from 1 to 65535 (it is "${env.PORT}").`);
  const logFormat = text(env.LOG_FORMAT).toLowerCase() || 'text';
  if (!['text', 'json'].includes(logFormat)) problems.push(`LOG_FORMAT must be text or json (it is "${env.LOG_FORMAT}").`);

  // Where people open the app; links in emails point here. From .env only, never from a request.
  const appUrl = (() => {
    try {
      const u = new URL(text(env.APP_URL) || `http://localhost:${port}`);
      return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}${u.pathname.replace(/\/+$/, '')}` : '';
    } catch { return ''; }
  })();

  const config = {
    port,
    root: ROOT,
    distDir: path.join(ROOT, 'dist'),
    dataFile: text(env.DATA_FILE) || path.join(ROOT, 'server', 'data.json'), // chat data from before MongoDB, imported once
    instance: text(env.INSTANCE_ID) || `${hostname()}:${process.pid}`,
    logFormat,
    allowedOrigin: env.ALLOWED_ORIGIN || '*',
    trust: parseTrustProxy(env.TRUST_PROXY),
    appUrl,
    shutdownMs: 10_000,
    anthropic: {
      key: text(env.ANTHROPIC_API_KEY),
      model: text(env.ANTHROPIC_MODEL) || 'claude-sonnet-5-5',
      baseUrl: base(env.ANTHROPIC_BASE_URL, 'https://api.anthropic.com'),
      timeoutMs: positive(env.AI_TIMEOUT_MS, 90_000),
      perMinute: positive(env.AI_RATE_PER_MIN, 15), // AI calls per minute per IP (they cost money)
    },
    images: {
      geminiKey: text(env.GEMINI_API_KEY),
      openaiKey: text(env.OPENAI_API_KEY),
      geminiBase: base(env.GEMINI_BASE_URL, 'https://generativelanguage.googleapis.com'),
      openaiBase: base(env.OPENAI_BASE_URL, 'https://api.openai.com'),
      geminiModel: text(env.GEMINI_IMAGE_MODEL) || 'gemini-nano-banana-2.1',
      openaiModel: text(env.OPENAI_IMAGE_MODEL) || 'gpt-image-2.5-sunburst',
      provider: text(env.IMAGE_PROVIDER).toLowerCase(),
      timeoutMs: positive(env.IMAGE_TIMEOUT_MS, 150_000),
    },
    mongo: {
      uri: text(env.MONGODB_URI),
      db: text(env.MONGODB_DB) || 'may_ani',
      timeoutMs: positive(env.MONGODB_TIMEOUT_MS, 8000),
    },
    perMinute: {
      auth: positive(env.AUTH_RATE_PER_MIN, 20),
      reset: positive(env.RESET_RATE_PER_MIN, 5),
      sync: positive(env.SYNC_RATE_PER_MIN, 120),
    },
    daily: {
      ai: { account: envCount(env, 'AI_DAILY_ACCOUNT', 20), total: envCount(env, 'AI_DAILY_TOTAL', 300) },
      pictures: { account: envCount(env, 'PICTURES_DAILY_ACCOUNT', 9), total: envCount(env, 'PICTURES_DAILY_TOTAL', 60) },
    },
    mailEnv: env, // server/mail.mjs reads SMTP_USER, SMTP_PASSWORD, SMTP_HOST, SMTP_PORT and EMAIL_FROM itself
  };
  return { config, problems };
}
