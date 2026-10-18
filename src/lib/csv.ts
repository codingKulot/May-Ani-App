/**
 * One CSV cell. Text that Excel or Google Sheets would run as a formula (starting with = + - @, a tab or a line break,
 * e.g. a buyer named "=HYPERLINK(...)") gets a ' in front, so it shows as plain text. Plain numbers like -500 stay numbers.
 */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r\n]/.test(s) && !/^[-+]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** A table as CSV text. It starts with a byte-order mark so Excel shows ₱, ñ and other non-English letters correctly. */
export function toCsv(rows: (string | number)[][]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
