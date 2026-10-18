import { describe, expect, test } from 'bun:test';
import { VERSES, verseForDate } from '@/data/verses';
import { addDays } from '@/lib/format';

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

describe('verse of the day', () => {
  test('every verse has a reference, text and unique ref', () => {
    expect(VERSES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(VERSES.map((v) => v.ref)).size).toBe(VERSES.length);
    VERSES.forEach((v) => { expect(v.ref.length).toBeGreaterThan(3); expect(v.text.length).toBeGreaterThan(20); });
  });
  test('same date gives the same verse; stride stays coprime with the list size', () => {
    expect(verseForDate('2026-10-17')).toBe(verseForDate('2026-10-17'));
    expect(gcd(17, VERSES.length)).toBe(1);
  });
  test('consecutive days cycle through every verse before repeating', () => {
    const seen = new Set<string>();
    let d = '2026-01-01';
    for (let i = 0; i < VERSES.length; i++) { seen.add(verseForDate(d).ref); d = addDays(d, 1); }
    expect(seen.size).toBe(VERSES.length);
  });
  test('"Another" steps to a different verse', () => {
    expect(verseForDate('2026-10-17', 1).ref).not.toBe(verseForDate('2026-10-17').ref);
  });
});
