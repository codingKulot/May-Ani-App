import type { ImagePayload } from './image';

/**
 * Keeps each plan's site photos on this device. Photos are far too big for localStorage (5 MB for
 * the whole app), so they go in IndexedDB. If IndexedDB is unavailable (private window, blocked
 * storage) we keep them in memory for the session instead of failing.
 */

export interface StoredPhoto { dataUrl: string; width: number; height: number }

const DB_NAME = 'may-ani-photos';
const STORE = 'photos';
const memory = new Map<string, StoredPhoto[]>();

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB error'));
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'));
      t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export const toStored = (p: Pick<ImagePayload, 'dataUrl' | 'width' | 'height'>): StoredPhoto => ({ dataUrl: p.dataUrl, width: p.width, height: p.height });

export const toPayload = (p: StoredPhoto): ImagePayload => ({
  mediaType: 'image/jpeg', data: p.dataUrl.split(',')[1] ?? '', dataUrl: p.dataUrl, width: p.width, height: p.height,
});

export async function savePhotos(planId: string, photos: StoredPhoto[]): Promise<void> {
  memory.set(planId, photos);
  try { await tx('readwrite', (s) => s.put(photos, planId)); } catch { /* memory copy still works this session */ }
}

export async function loadPhotos(planId: string): Promise<StoredPhoto[]> {
  try {
    const found = await tx<StoredPhoto[] | undefined>('readonly', (s) => s.get(planId) as IDBRequest<StoredPhoto[] | undefined>);
    if (Array.isArray(found)) return found;
  } catch { /* fall through to memory */ }
  return memory.get(planId) ?? [];
}

const RENDER_DESIGNS = ['raised', 'containers', 'vertical'];
const renderKey = (planId: string, designId: string) => `${planId}#render#${designId}`;
const renderMemory = new Map<string, string>();

/** AI-made pictures are kept per plan and design, on this device, so they are not paid for twice. */
export async function saveRender(planId: string, designId: string, dataUrl: string): Promise<void> {
  const k = renderKey(planId, designId);
  renderMemory.set(k, dataUrl);
  try { await tx('readwrite', (s) => s.put(dataUrl, k)); } catch { /* memory copy still works this session */ }
}

export async function loadRender(planId: string, designId: string): Promise<string | undefined> {
  const k = renderKey(planId, designId);
  try {
    const found = await tx<string | undefined>('readonly', (s) => s.get(k) as IDBRequest<string | undefined>);
    if (typeof found === 'string') return found;
  } catch { /* fall through to memory */ }
  return renderMemory.get(k);
}

export async function deletePhotos(planId: string): Promise<void> {
  memory.delete(planId);
  try { await tx('readwrite', (s) => s.delete(planId)); } catch { /* nothing to clean up */ }
  for (const d of RENDER_DESIGNS) {
    const k = renderKey(planId, d);
    renderMemory.delete(k);
    try { await tx('readwrite', (s) => s.delete(k)); } catch { /* nothing to clean up */ }
  }
}
