import type { ISODate } from './types';

export const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: ISODate): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = (now = new Date()) => toDateKey(now);

export function addDays(key: ISODate, n: number): ISODate {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function addMonths(key: ISODate, n: number): ISODate {
  const d = parseDateKey(key);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return toDateKey(d);
}

export function startOfWeek(key: ISODate, weekStartsOn: 0 | 1): ISODate {
  const diff = (parseDateKey(key).getDay() - weekStartsOn + 7) % 7;
  return addDays(key, -diff);
}

export const startOfMonth = (key: ISODate): ISODate => key.slice(0, 8) + '01';

export function endOfMonth(key: ISODate): ISODate {
  const d = parseDateKey(startOfMonth(key));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toDateKey(d);
}

export const startOfYear = (key: ISODate): ISODate => key.slice(0, 4) + '-01-01';

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86400000);
}

export function rangeKeys(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

/** Fecha local + "HH:MM" → Date. */
export function localDateTime(key: ISODate, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = parseDateKey(key);
  d.setHours(h, m, 0, 0);
  return d;
}

/** ISO → valor de <input type="datetime-local">. */
export function toLocalInput(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

export function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const nowIso = () => new Date().toISOString();
