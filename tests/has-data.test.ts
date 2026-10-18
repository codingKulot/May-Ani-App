import { describe, expect, test } from 'bun:test';
import { hasUserData } from '@/core/actions';
import { initialState } from '@/core/store';
import { DEFAULT_PLACE } from '@/data/places';
import { LIST_COLLECTIONS } from '@/services/sync/records';
import type { AppState } from '@/types';

/** Settings greys out "Back up" and "Delete all my data" when this is false. */
describe('hasUserData', () => {
  const empty = (): AppState => ({
    ...initialState(),
    profile: { id: 'p1', name: 'Juan', location: DEFAULT_PLACE, guest: true, role: 'farmer', createdAt: '2026-10-18T00:00:00.000Z' },
  });

  test('a new profile with nothing in it has no data', () => {
    expect(hasUserData(empty())).toBe(false);
  });

  test('settings, chat samples and the permit sector do not count', () => {
    const s = empty();
    s.settings = { ...s.settings, apiBase: 'http://example.test' };
    s.permitSector = 'aquaculture';
    s.contacts = [{ id: 'sample-x', name: 'Sample', kind: 'business', blurb: '', sample: true }];
    s.chats = [{ id: 'm1', contactId: 'sample-x', from: 'them', text: 'Hi', at: '2026-10-18T00:00:00.000Z' }];
    s.permitProgress = { 'bfar-license': false }; // ticked, then unticked
    expect(hasUserData(s)).toBe(false);
  });

  test('one item in any list that follows the account counts', () => {
    for (const c of LIST_COLLECTIONS) {
      const s = empty();
      (s as any)[c] = [{ id: 'x1' }];
      expect({ c, has: hasUserData(s) }).toEqual({ c, has: true });
    }
  });

  test('preferences the user set count', () => {
    const cases: Partial<AppState>[] = [
      { permitProgress: { 'bfar-license': true } },
      { watchlist: ['talong'] },
      { marketOverrides: { talong: { retailPerKg: 90 } } },
      { materialPrices: { coco_lumber: 120 } },
    ];
    for (const patch of cases) expect(hasUserData({ ...empty(), ...patch })).toBe(true);
  });
});
