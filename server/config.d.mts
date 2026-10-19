// Types for server/config.mjs, so the TypeScript tests can import it (the server itself is plain JavaScript).
export const ROOT: string;
export function loadEnvFile(file?: string, env?: Record<string, string | undefined>): void;
export interface Config {
  port: number;
  root: string;
  distDir: string;
  dataFile: string;
  instance: string;
  logFormat: 'text' | 'json';
  allowedOrigin: string;
  appUrl: string;
  shutdownMs: number;
  [more: string]: unknown;
}
export function loadConfig(env: Record<string, string | undefined>): { config: Config; problems: string[] };
