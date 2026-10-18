/**
 * Minimal ambient typings so the project type-checks without @types/react.
 * When you can `npm i -D @types/react @types/react-dom`, delete this file and
 * the real typings take over automatically.
 */
declare module 'react' {
  export type ReactNode = any;
  export type ReactElement = any;
  export type FC<P = {}> = (props: P & { children?: ReactNode }) => any;
  export type CSSProperties = Record<string, string | number | undefined>;
  export type ChangeEvent<T = any> = { target: T; currentTarget: T };
  export type FormEvent<T = any> = { preventDefault(): void; target: T; currentTarget: T };
  export type MouseEvent<T = any> = {
    clientX: number; clientY: number; currentTarget: T; target: any;
    preventDefault(): void; stopPropagation(): void;
  };
  export type KeyboardEvent<T = any> = { key: string; currentTarget: T; preventDefault(): void };
  export type RefObject<T> = { current: T | null };
  export function useState<S>(init: S | (() => S)): [S, (v: S | ((p: S) => S)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(init: T): { current: T };
  export function useRef<T>(init: T | null): RefObject<T>;
  export function useSyncExternalStore<T>(
    subscribe: (cb: () => void) => () => void,
    getSnapshot: () => T,
  ): T;
  export function useId(): string;
  export function createElement(type: any, props?: any, ...children: any[]): any;
  export const StrictMode: any;
  export const Fragment: any;
  const React: any;
  export default React;
}
declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(node: any): void };
}
declare namespace JSX {
  interface DomHandlers {
    onClick?: (e: any) => void; onChange?: (e: any) => void; onInput?: (e: any) => void;
    onSubmit?: (e: any) => void; onKeyDown?: (e: any) => void; onKeyUp?: (e: any) => void;
    onPointerDown?: (e: any) => void; onPointerMove?: (e: any) => void; onPointerUp?: (e: any) => void;
    onPointerLeave?: (e: any) => void; onMouseDown?: (e: any) => void; onMouseMove?: (e: any) => void;
    onMouseUp?: (e: any) => void; onWheel?: (e: any) => void; onLoad?: (e: any) => void; onError?: (e: any) => void;
    onFocus?: (e: any) => void; onBlur?: (e: any) => void; onDragOver?: (e: any) => void; onDrop?: (e: any) => void;
    onTouchStart?: (e: any) => void; onTouchMove?: (e: any) => void; onTouchEnd?: (e: any) => void;
    onToggle?: (e: any) => void; onDoubleClick?: (e: any) => void; onContextMenu?: (e: any) => void;
  }
  interface IntrinsicElements { [tag: string]: DomHandlers & { [attr: string]: any } }
  interface IntrinsicAttributes { key?: string | number }
  type Element = any;
}
declare const process: { env: Record<string, string | undefined>; execPath: string };

declare module 'bun:test' {
  export const describe: {
    (name: string, fn: () => void): void;
    skipIf(condition: boolean): (name: string, fn: () => void) => void;
  };
  export function test(name: string, fn: () => void | Promise<void>, timeoutMs?: number): void;
  export function expect(v: any): any;
  export function afterEach(fn: () => void): void;
  export function afterAll(fn: () => void | Promise<void>): void;
}


declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, opts?: { recursive?: boolean; force?: boolean }): void;
}
declare module 'node:os' {
  export function tmpdir(): string;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
declare module 'node:child_process' {
  interface Stream { on(event: 'data', fn: (chunk: any) => void): void }
  export function spawn(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string | undefined>; stdio?: any }): {
    stdout: Stream; stderr: Stream; exitCode: number | null; kill(): boolean;
  };
}
// Used by the fake mail server and the Host-header test (tests/support).
declare module 'node:net' {
  export interface Socket {
    destroyed: boolean; write(s: string): boolean; end(): void; destroy(): void; setEncoding(e: string): void; on(event: string, fn: (...a: any[]) => void): void;
  }
  export function createServer(fn: (sock: Socket) => void): {
    listen(port: number, host: string, cb: () => void): void; address(): unknown; close(cb?: () => void): void;
  };
}
declare module 'node:http' {
  export function request(
    opts: { host: string; port: number; path: string; method: string; headers?: Record<string, string | number> },
    cb: (res: { statusCode?: number; on(event: string, fn: (chunk?: any) => void): void }) => void,
  ): { on(event: 'error', fn: (e: Error) => void): void; end(data?: string): void };
}
declare const Buffer: {
  from(data: string, encoding?: string): { toString(encoding?: string): string };
  byteLength(s: string): number;
};
