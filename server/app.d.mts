// Types for server/app.mjs, so the TypeScript tests can create a server in their own process.
import type { Config } from './config.mjs';

export interface Log { format: string; info(msg: string, extra?: object): void; warn(msg: string, extra?: object): void; error(msg: string, extra?: object): void }
export interface App {
  listen(port?: number): Promise<number>;
  announce(port: number): void;
  shutdown(): Promise<void>;
  waiting(): number;
  log: Log;
}
export function createApp(config: Config, o?: { log?: Log; chatPollMs?: number }): Promise<App>;
