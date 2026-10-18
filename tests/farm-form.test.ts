import { describe, expect, test } from 'bun:test';
import { buildFarm, checkFarmForm, toSqm, type FarmFormInput } from '@/services/farmForm';

const place = { name: 'San Jose', province: 'Nueva Ecija', lat: 15.79, lon: 120.99 };
const today = new Date(2026, 9, 18);
const base = (patch: Partial<FarmFormInput> = {}): FarmFormInput => ({ name: 'Ponds', sector: 'fish', area: 500, unit: 'sqm', location: place, lines: [], ...patch });

describe('add existing farm form', () => {
  test('hectares convert to sqm', () => {
    expect(toSqm(1.5, 'ha')).toBe(15000);
    expect(toSqm(0.25, 'ha')).toBe(2500);
    expect(toSqm(320, 'sqm')).toBe(320);
  });

  test('a filled basic form has no errors', () => {
    expect(checkFarmForm(base(), today)).toEqual({});
  });

  test('name and area are required', () => {
    const e = checkFarmForm(base({ name: '  ', area: 0 }), today);
    expect(e.name).toBeDefined();
    expect(e.area).toBeDefined();
  });

  test('items need an area and cannot exceed the farm', () => {
    expect(checkFarmForm(base({ lines: [{ itemId: 'tilapia', areaSqm: 0, startedOn: '2026-09-01' }] }), today).lines).toContain('area');
    expect(checkFarmForm(base({ lines: [{ itemId: 'tilapia', areaSqm: 400, startedOn: '2026-09-01' }, { itemId: 'tilapia', areaSqm: 200, startedOn: '2026-09-01' }] }), today).lines).toContain('more than');
    expect(checkFarmForm(base({ area: 0.06, unit: 'ha', lines: [{ itemId: 'tilapia', areaSqm: 600, startedOn: '2026-09-01' }] }), today)).toEqual({});
  });

  test('future start dates and odd years are rejected', () => {
    expect(checkFarmForm(base({ lines: [{ itemId: 'tilapia', areaSqm: 100, startedOn: '2026-12-01' }] }), today).lines).toContain('future');
    expect(checkFarmForm(base({ sinceYear: 2030 }), today).sinceYear).toBeDefined();
    expect(checkFarmForm(base({ sinceYear: 2015 }), today).sinceYear).toBeUndefined();
  });

  test('buildFarm trims text, converts area and makes production records', () => {
    const { farm, records } = buildFarm(base({ name: ' Ponds ', area: 0.1, unit: 'ha', barangay: '  ', notes: ' floods in Aug ', tenure: 'rented', lines: [{ itemId: 'tilapia', areaSqm: 300, startedOn: '2026-09-01' }] }));
    expect(farm).toMatchObject({ name: 'Ponds', areaSqm: 1000, notes: 'floods in Aug', tenure: 'rented' });
    expect(farm.barangay).toBeUndefined();
    expect(records).toEqual([{ itemId: 'tilapia', areaSqm: 300, plantedOn: '2026-09-01' }]);
  });
});
