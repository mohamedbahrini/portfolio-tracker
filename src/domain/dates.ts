import type { ISODate } from './types';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isISODate(value: string): value is ISODate {
  if (!ISO_RE.test(value)) return false;
  const d = parseISODate(value);
  return toISODate(d) === value;
}

/** Parses `YYYY-MM-DD` as a UTC midnight Date so arithmetic is timezone-safe. */
export function parseISODate(value: ISODate): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

/** Formats a UTC-midnight Date (as produced by {@link parseISODate}) back to `YYYY-MM-DD`. */
export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

/** The user's current local calendar day. */
export function todayLocal(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Converts a picker Date (local time) to the local calendar day it represents. */
export const localDateToISO = todayLocal;

/** Builds a local Date for a calendar day, suitable for native date pickers. */
export function isoToLocalDate(value: ISODate): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(value: ISODate, days: number): ISODate {
  return toISODate(new Date(parseISODate(value).getTime() + days * MS_PER_DAY));
}

export function addMonths(value: ISODate, months: number): ISODate {
  const d = parseISODate(value);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toISODate(target);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export interface MonthRef {
  year: number;
  /** 1-12 */
  month: number;
}

export function monthOf(date: ISODate): MonthRef {
  const [y, m] = date.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1 };
}

export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthKey({ year, month }: MonthRef): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Weeks of a month as rows of 7 cells (Monday first). Cells outside the month are `null`.
 */
export function monthGrid({ year, month }: MonthRef): (ISODate | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells: (ISODate | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toISODate(new Date(Date.UTC(year, month - 1, day))));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (ISODate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
