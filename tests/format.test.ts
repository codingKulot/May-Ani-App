import { describe, expect, test } from 'bun:test';
import { addDays, parseNumber, prettyDate } from '@/lib/format';
import { csvCell, toCsv } from '@/lib/csv';

describe('parseNumber (what people type in number boxes)', () => {
  test('reads numbers with commas, peso signs and spaces', () => {
    expect(parseNumber('1500')).toBe(1500);
    expect(parseNumber('1,500')).toBe(1500);
    expect(parseNumber('₱ 1,500.50')).toBe(1500.5);
    expect(parseNumber('PHP 250')).toBe(250);
    expect(parseNumber('1 500')).toBe(1500);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('12.')).toBe(12);
    expect(parseNumber('-3')).toBe(-3);
  });

  test('anything else is not a number', () => {
    for (const t of ['', ' ', 'abc', '1.2.3', '12abc', '₱', '--1', '1e5']) expect({ t, n: parseNumber(t) }).toEqual({ t, n: NaN });
  });
});

describe('dates', () => {
  test('an empty date shows "No date", never "Invalid Date"', () => {
    expect(prettyDate('')).toBe('No date');
    expect(prettyDate('2026-10-18')).toContain('2026');
    expect(addDays('', 5)).toBe('');
    expect(addDays('2026-10-30', 5)).toBe('2026-11-04');
  });
});

describe('CSV export', () => {
  test('text that a spreadsheet would run as a formula is made harmless', () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe(`"'=HYPERLINK(""http://x"",""click"")"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('-cmd')).toBe(`"'-cmd"`);
  });

  test('numbers and ordinary text stay as they are', () => {
    expect(csvCell(-500)).toBe('"-500"');
    expect(csvCell('-12.5')).toBe('"-12.5"');
    expect(csvCell('+639171234567')).toBe('"+639171234567"'); // a phone number written with + is just a number
    expect(csvCell('Talong, 2nd harvest')).toBe('"Talong, 2nd harvest"');
  });

  test('the file starts with a byte-order mark so Excel shows ₱ and ñ', () => {
    const csv = toCsv([['item', 'buyer'], ['Talong', 'Niño']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('﻿"item","buyer"\r\n"Talong","Niño"\r\n');
  });
});
