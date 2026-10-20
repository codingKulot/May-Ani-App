import { describe, expect, test } from 'bun:test';
import { planSectors, sectorsLabel } from '@/data/catalog';
import {
  NO_FARM_TYPE, areaFieldLabel, buildFarm, checkFarmForm, itemsTitle, nameHint, startedLabel, toSqm, toggleFarmSector, type FarmFormInput,
} from '@/services/farmForm';
import { validRecord } from '@/services/sync/records';

const place = { name: 'San Jose', province: 'Nueva Ecija', lat: 15.79, lon: 120.99 };
const today = new Date(2026, 9, 18);
const base = (patch: Partial<FarmFormInput> = {}): FarmFormInput => ({ name: 'Ponds', sectors: ['fish'], area: 500, unit: 'sqm', location: place, lines: [], ...patch });
const line = (itemId: string, areaSqm = 100) => ({ itemId, areaSqm, startedOn: '2026-09-01' });

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

describe('add existing farm form: more than one type', () => {
  test('at least one type is required, with the same message as the planner', () => {
    expect(checkFarmForm(base({ sectors: [] }), today).sectors).toBe(NO_FARM_TYPE);
    expect(NO_FARM_TYPE).toContain('at least one');
    expect(checkFarmForm(base({ sectors: ['crops', 'fish'] }), today)).toEqual({});
  });

  test('a single-type farm is saved as before: sector only, no sectors list', () => {
    for (const sec of ['crops', 'fruits', 'fish', 'livestock'] as const) {
      const { farm } = buildFarm(base({ sectors: [sec] }));
      expect(farm.sector).toBe(sec);
      expect('sectors' in farm).toBe(false);
    }
  });

  test('a mixed farm keeps sector = first type and the whole list in SECTORS order, like a saved mixed plan', () => {
    const { farm, records } = buildFarm(base({ sectors: ['livestock', 'crops', 'fish', 'crops'], lines: [line('kamatis'), line('tilapia', 200), line('native_chicken', 50)] }));
    expect(farm.sector).toBe('crops');
    expect(farm.sectors).toEqual(['crops', 'fish', 'livestock']);
    expect(planSectors(farm)).toEqual(['crops', 'fish', 'livestock']);
    expect(sectorsLabel(planSectors(farm))).toBe('Vegetables + Fish + Livestock');
    expect(records.map((r) => r.itemId)).toEqual(['kamatis', 'tilapia', 'native_chicken']);
  });

  test("the form's row ids stay with their lines and are never saved", () => {
    let f = base({ sectors: ['crops', 'fish'], lines: [{ ...line('kamatis'), row: 1 }, { ...line('tilapia', 300), row: 2 }] });
    f = toggleFarmSector(f, 'crops');
    expect(f.lines).toEqual([{ ...line('tilapia', 300), row: 2 }]);
    expect(buildFarm(f).records).toEqual([{ itemId: 'tilapia', areaSqm: 300, plantedOn: '2026-09-01' }]);
  });

  test('a mixed farm from the form passes the account sync check', () => {
    const { farm } = buildFarm(base({ sectors: ['fruits', 'fish'] }));
    const saved = { ...farm, id: 'farm_1', createdAt: '2026-10-20T01:00:00.000Z' };
    expect(validRecord({ c: 'farms', id: saved.id, t: 1, d: JSON.parse(JSON.stringify(saved)) })).toBe(true);
  });

  test('turning types on keeps SECTORS order; turning one off removes only its lines', () => {
    let f = base({ sectors: ['fish'], lines: [line('tilapia')] });
    f = toggleFarmSector(f, 'livestock');
    f = toggleFarmSector(f, 'crops');
    expect(f.sectors).toEqual(['crops', 'fish', 'livestock']);
    expect(f.lines.map((l) => l.itemId)).toEqual(['tilapia']);
    f = { ...f, lines: [...f.lines, line('kamatis'), line('goat'), line('pechay')] };
    f = toggleFarmSector(f, 'crops');
    expect(f.sectors).toEqual(['fish', 'livestock']);
    expect(f.lines.map((l) => l.itemId)).toEqual(['tilapia', 'goat']);
    f = toggleFarmSector(toggleFarmSector(f, 'fish'), 'livestock');
    expect(f.sectors).toEqual([]);
    expect(f.lines).toEqual([]);
    expect(checkFarmForm(f, today).sectors).toBe(NO_FARM_TYPE);
  });

  test('toggling does not change the rest of the form', () => {
    const f = base({ name: 'Bukid', area: 2, unit: 'ha', notes: 'x', tenure: 'owned' });
    const g = toggleFarmSector(f, 'fruits');
    expect({ ...g, sectors: f.sectors }).toEqual(f);
  });

  test('labels have a sensible wording for a mix', () => {
    expect(areaFieldLabel(['fish'])).toBe('Pond / tank area');
    expect(areaFieldLabel(['livestock'])).toBe('Pen and yard area');
    expect(areaFieldLabel(['crops'])).toBe('Farm area');
    expect(areaFieldLabel(['crops', 'fish'])).toBe('Whole farm area');
    expect(areaFieldLabel([])).toBe('Farm area');

    expect(nameHint(['fish'])).toContain('Tilapia');
    expect(nameHint(['crops', 'fruits'])).toBe('e.g. Family farm sa bukid');

    expect(itemsTitle(['livestock'])).toBe('What animals do you have now?');
    expect(itemsTitle(['crops', 'fruits'])).toBe('What are you growing now?');
    expect(itemsTitle(['fish', 'livestock'])).toBe('What are you raising now?');
    expect(itemsTitle(['fruits', 'fish'])).toBe('What are you growing and raising now?');
    expect(itemsTitle([])).toBe('What are you growing or raising now?');
  });

  test('each line gets the date label of its own item', () => {
    expect(startedLabel('kamatis', 'fish')).toBe('Planted on');
    expect(startedLabel('mango', 'fish')).toBe('Planted on');
    expect(startedLabel('tilapia', 'crops')).toBe('Stocked on');
    expect(startedLabel('goat', 'crops')).toBe('Started on');
    expect(startedLabel('no_such_item', 'fish')).toBe('Stocked on');
  });

  test('items of all types count toward the farm area', () => {
    const f = base({ sectors: ['crops', 'fish'], area: 300, lines: [line('kamatis', 200), line('tilapia', 150)] });
    expect(checkFarmForm(f, today).lines).toContain('more than');
    expect(checkFarmForm({ ...f, area: 350 }, today)).toEqual({});
  });
});
