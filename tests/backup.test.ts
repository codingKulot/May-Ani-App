import { beforeEach, describe, expect, test } from 'bun:test';
import { createProfile, importData } from '@/core/actions';
import { getState, resetState, setState } from '@/core/store';
import { DEFAULT_PLACE } from '@/data/places';
import { cleanBackup } from '@/services/sync/records';

/** Restoring a backup file (Settings > Your data > Restore) must never crash the app or change the phone's settings or login. */
const farm = (id: string) => ({ id, name: `Farm ${id}`, sector: 'crops' as const, areaSqm: 100, location: DEFAULT_PLACE, createdAt: '2026-10-18T00:00:00.000Z' });
const task = (id: string) => ({ id, title: 'Water the beds', date: '2026-10-18', done: false });

describe('cleanBackup', () => {
  test('keeps good items and leaves out damaged, duplicate and badly named ones', () => {
    const { patch, skipped } = cleanBackup({
      farms: [farm('f1'), { id: 'f2', name: 'No location', sector: 'crops', areaSqm: 5, createdAt: 'x' }, farm('f1'), farm('bad id!'), null, 'text'],
      tasks: [task('t1'), { id: 't2', title: 'No date', done: false }],
      plans: [],
    });
    expect(patch.farms?.map((f) => f.id)).toEqual(['f1']);
    expect(patch.tasks?.map((t) => t.id)).toEqual(['t1']);
    expect(patch.plans).toEqual([]);
    expect(skipped).toBe(6);
  });

  test('only farm data comes in: never the profile, settings, login, chat or active farm', () => {
    const { patch } = cleanBackup({
      farms: [farm('f1')], plans: [],
      profile: { id: 'evil', name: 'Evil', account: { id: 'a', email: 'evil@example.test' } },
      settings: { apiBase: 'https://attacker.example', marketFeedUrl: '', units: 'metric' },
      chats: [{ id: 'm1' }], contacts: [{ id: 'c1' }], activeFarmId: 'f1', version: 99,
    });
    expect(Object.keys(patch).sort()).toEqual(['farms', 'plans']);
  });

  test('preferences come in only when they look right', () => {
    const { patch, skipped } = cleanBackup({ farms: [], plans: [], watchlist: ['talong'], materialPrices: { coco_lumber: 'free' }, permitSector: 'fishing' });
    expect(patch.watchlist).toEqual(['talong']);
    expect('materialPrices' in patch).toBe(false);
    expect('permitSector' in patch).toBe(false);
    expect(skipped).toBe(2);
  });
});

describe('importData', () => {
  beforeEach(() => {
    resetState();
    createProfile('Juan', DEFAULT_PLACE, 'farmer', true);
    setState((s) => ({ ...s, settings: { ...s.settings, apiBase: 'http://192.168.1.20:8787' }, tasks: [task('mine')], farms: [farm('old')], activeFarmId: 'old' }));
  });

  test('a doctored file cannot change the server address or the profile', () => {
    const before = getState();
    const r = importData(JSON.stringify({
      farms: [farm('f1')], plans: [],
      settings: { apiBase: 'https://attacker.example', marketFeedUrl: '', units: 'metric' },
      profile: { id: 'evil', name: 'Evil', location: DEFAULT_PLACE, guest: false, role: 'farmer', createdAt: '', account: { id: 'a', email: 'evil@example.test' } },
    }));
    expect(r).toEqual({ ok: true, skipped: 0 });
    const after = getState();
    expect(after.settings.apiBase).toBe('http://192.168.1.20:8787');
    expect(after.profile).toEqual(before.profile);
    expect(after.farms.map((f) => f.id)).toEqual(['f1']);
  });

  test('lists missing from the file are kept, and the active farm points at a farm that exists', () => {
    importData(JSON.stringify({ farms: [farm('f1'), farm('f2')], plans: [] }));
    const s = getState();
    expect(s.tasks.map((t) => t.id)).toEqual(['mine']);
    expect(s.activeFarmId).toBe('f1');
  });

  test('damaged items are counted and left out', () => {
    const r = importData(JSON.stringify({ farms: [farm('f1'), { id: 'f2' }], plans: [{ id: 'p1' }] }));
    expect(r).toEqual({ ok: true, skipped: 2 });
    expect(getState().plans).toEqual([]);
  });

  test('files that are not backups change nothing', () => {
    const before = getState();
    expect(importData('not json').ok).toBe(false);
    expect(importData('null').ok).toBe(false);
    expect(importData(JSON.stringify({ farms: 'x', plans: [] })).ok).toBe(false);
    expect(getState()).toBe(before);
  });
});
