import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { RECYCLABLE_IDS } from '@/data/recyclables';
import { materialById } from '@/data/materials';
import { savePhotos, loadPhotos, deletePhotos, toPayload, toStored, saveRender, loadRender } from '@/lib/photoStore';
import { MAX_PROMPT } from '@/services/build/prompt';

const server = readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8');

const listIn = (name: string): string[] => {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(server);
  if (!m) throw new Error(`${name} not found in server/index.mjs`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};

describe('server and app agree on ids', () => {
  test('the server accepts exactly the recyclable ids the app knows', () => {
    expect(listIn('RECYCLABLE_IDS').sort()).toEqual([...RECYCLABLE_IDS].sort());
  });
  test('every on-site id the server accepts is a real material', () => {
    for (const id of listIn('ONSITE_IDS')) expect(materialById(id)).toBeDefined();
  });
});

describe('image endpoint', () => {
  test('server and app use the same prompt limit', () => {
    expect(Number(/const MAX_PROMPT = (\d+)/.exec(server)?.[1])).toBe(MAX_PROMPT);
  });
  test('cached pictures are removed with the plan', async () => {
    await saveRender('p9', 'raised', 'data:image/png;base64,AAAA');
    expect(await loadRender('p9', 'raised')).toBe('data:image/png;base64,AAAA');
    await deletePhotos('p9');
    expect(await loadRender('p9', 'raised')).toBeUndefined();
  });
});

describe('photo store (memory fallback: no IndexedDB in tests)', () => {
  const photo = { dataUrl: 'data:image/jpeg;base64,AAAA', width: 10, height: 20 };
  test('saves, loads and deletes per plan', async () => {
    expect(await loadPhotos('p1')).toEqual([]);
    await savePhotos('p1', [photo]);
    expect(await loadPhotos('p1')).toEqual([photo]);
    expect(await loadPhotos('p2')).toEqual([]);
    await deletePhotos('p1');
    expect(await loadPhotos('p1')).toEqual([]);
  });
  test('converts to the payload the AI call needs', () => {
    const p = toPayload(photo);
    expect(p.data).toBe('AAAA');
    expect(p.mediaType).toBe('image/jpeg');
    expect(toStored({ ...p })).toEqual(photo);
  });
});
