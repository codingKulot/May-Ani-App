import { describe, expect, test } from 'bun:test';
import { DAMAGED_KEY, damagedCopy, getSaveProblem, loadFrom, persist, startupProblem, type SaveStorage } from '@/core/store';

const KEY = 'may-ani.state.v1';

/** A phone's localStorage in memory. `full` makes every save fail like a full phone does. */
function fakeStorage(items: Record<string, string> = {}, full = false): SaveStorage & { items: Record<string, string> } {
  return {
    items,
    getItem: (k) => items[k] ?? null,
    setItem: (k, v) => {
      if (full) throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
      items[k] = v;
    },
    removeItem: (k) => { delete items[k]; },
  };
}

describe('loading the saved data', () => {
  test('nothing saved: a fresh start', () => {
    expect(loadFrom(fakeStorage()).farms).toEqual([]);
    expect(loadFrom(null).farms).toEqual([]);
  });

  test('saved data comes back, with keys added in later versions filled in', () => {
    const s = loadFrom(fakeStorage({ [KEY]: JSON.stringify({ version: 1, farms: [{ id: 'f1' }], plans: [] }) }));
    expect(s.farms).toEqual([{ id: 'f1' }] as any);
    expect(s.materialPrices).toEqual({});
    expect(s.settings.apiBase).toBe('');
  });

  test('a list that is not a list is put back to empty, so pages do not crash', () => {
    const s = loadFrom(fakeStorage({ [KEY]: JSON.stringify({ version: 1, farms: 'oops', tasks: null, plans: [] }) }));
    expect(s.farms).toEqual([]);
    expect(s.tasks).toEqual([]);
  });

  test('data that cannot be read is moved aside, never overwritten, and the user is told', () => {
    const phone = fakeStorage({ [KEY]: '{"version":1,"farms":[{"id":"f1"' });
    const s = loadFrom(phone);
    expect(s.farms).toEqual([]);
    expect(phone.items[DAMAGED_KEY]).toBe('{"version":1,"farms":[{"id":"f1"');
    expect(phone.items[KEY]).toBeUndefined();
    expect(startupProblem).toContain('could not be read');
  });

  test('with no room for a copy, the damaged data is still kept for this session', () => {
    const phone = fakeStorage({ [KEY]: 'not json' }, true);
    loadFrom(phone);
    expect(damagedCopy()).toBe('not json');
  });
});

describe('saving', () => {
  test('a full phone shows a warning until saving works again', () => {
    persist(fakeStorage({}, true));
    expect(getSaveProblem()).toContain('no space left');
    const phone = fakeStorage();
    persist(phone);
    expect(getSaveProblem()).toBe('');
    expect(JSON.parse(phone.items[KEY]).version).toBe(1);
  });

  test('blocked storage shows its own warning', () => {
    persist(null);
    expect(getSaveProblem()).toContain('cannot save');
    persist(fakeStorage());
    expect(getSaveProblem()).toBe('');
  });
});
