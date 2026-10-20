// Types for server/db.mjs, so TypeScript files (scripts/backup.ts, tests) can import it (the server itself is plain JavaScript).
export function dbProblem(e: unknown): string;
export interface Database {
  collection(name: string): any;
  index(collection: string, keys: Record<string, 1 | -1>, options?: Record<string, unknown>): void;
  ensureIndexes(): Promise<unknown>;
  ping(): Promise<unknown>;
  close(): Promise<void>;
}
export function openDatabase(uri: string, dbName: string, timeoutMs?: number): Promise<Database>;
