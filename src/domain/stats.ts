import { subactivitySeconds } from './entries';
import { goalContribution } from './goals';
import { addDays, addMonths, diffDays, endOfMonth, rangeKeys, startOfMonth, startOfWeek, startOfYear } from './time';
import type { EntryMethod, EntrySubactivity, Goal, GoalLink, ISODate, TimeEntry } from './types';

export interface Filter {
  start: ISODate;
  end: ISODate;
  categoryId?: string;
  activityId?: string;
  subactivityId?: string;
  goalId?: string;
  method?: EntryMethod;
}

export type PeriodPreset = 'week' | 'month' | 'last7' | 'last30' | 'year' | 'all' | 'custom';

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  week: 'Esta semana',
  month: 'Este mes',
  last7: 'Últimos 7 días',
  last30: 'Últimos 30 días',
  year: 'Este año',
  all: 'Todo',
  custom: 'Personalizado',
};

export function periodRange(p: PeriodPreset, today: ISODate, weekStartsOn: 0 | 1, earliest?: ISODate): { start: ISODate; end: ISODate } {
  switch (p) {
    case 'week': {
      const s = startOfWeek(today, weekStartsOn);
      return { start: s, end: addDays(s, 6) };
    }
    case 'month':
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case 'last7':
      return { start: addDays(today, -6), end: today };
    case 'last30':
      return { start: addDays(today, -29), end: today };
    case 'year':
      return { start: startOfYear(today), end: today.slice(0, 4) + '-12-31' };
    default:
      return { start: earliest && earliest < today ? earliest : today, end: today };
  }
}

export interface StatsContext {
  subsByEntry: Map<string, EntrySubactivity[]>;
  goal?: Goal;
  goalLinks?: GoalLink[];
}

/** Segundos que aporta un registro bajo el filtro (null = no coincide). */
export function attributedSeconds(e: TimeEntry, f: Omit<Filter, 'start' | 'end'>, ctx: StatsContext): number | null {
  if (f.categoryId && e.categoryId !== f.categoryId) return null;
  if (f.activityId && e.activityId !== f.activityId) return null;
  if (f.method && e.method !== f.method) return null;
  const subs = ctx.subsByEntry.get(e.id) ?? [];
  let seconds = e.durationSeconds;
  if (f.subactivityId) {
    const s = subactivitySeconds(e, subs, f.subactivityId);
    if (s === null) return null;
    seconds = Math.min(seconds, s);
  }
  if (f.goalId && ctx.goal) {
    const c = goalContribution(ctx.goal, ctx.goalLinks ?? [], e, subs);
    if (!c.matched) return null;
    seconds = Math.min(seconds, c.seconds);
  }
  return seconds;
}

export interface Weighted {
  entry: TimeEntry;
  seconds: number;
}

export function applyFilter(entries: TimeEntry[], f: Filter, ctx: StatsContext, ignorePeriod = false): Weighted[] {
  const out: Weighted[] = [];
  for (const e of entries) {
    if (!ignorePeriod && (e.date < f.start || e.date > f.end)) continue;
    const s = attributedSeconds(e, f, ctx);
    if (s !== null) out.push({ entry: e, seconds: s });
  }
  return out;
}

export const totalSeconds = (rows: Weighted[]) => rows.reduce((a, r) => a + r.seconds, 0);

export function sumBy(rows: Weighted[], key: (e: TimeEntry) => string): { key: string; seconds: number; count: number }[] {
  const m = new Map<string, { seconds: number; count: number }>();
  for (const r of rows) {
    const k = key(r.entry);
    const v = m.get(k) ?? { seconds: 0, count: 0 };
    v.seconds += r.seconds;
    v.count += 1;
    m.set(k, v);
  }
  return [...m].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.seconds - a.seconds);
}

export const activityKey = (e: TimeEntry) => e.activityId ?? `cat:${e.categoryId}`;

/** Frecuencia y tiempo conocido por subactividad. */
export function bySubactivity(rows: Weighted[], subsByEntry: Map<string, EntrySubactivity[]>) {
  const m = new Map<string, { seconds: number; count: number }>();
  for (const { entry } of rows) {
    const subs = subsByEntry.get(entry.id) ?? [];
    for (const s of subs) {
      const v = m.get(s.subactivityId) ?? { seconds: 0, count: 0 };
      v.seconds += subactivitySeconds(entry, subs, s.subactivityId) ?? 0;
      v.count += 1;
      m.set(s.subactivityId, v);
    }
  }
  return [...m].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count || b.seconds - a.seconds);
}

export type Granularity = 'day' | 'week' | 'month' | 'year';

export function bucketOf(date: ISODate, g: Granularity, weekStartsOn: 0 | 1): string {
  if (g === 'day') return date;
  if (g === 'week') return startOfWeek(date, weekStartsOn);
  if (g === 'month') return date.slice(0, 7);
  return date.slice(0, 4);
}

export function bucketKeys(start: ISODate, end: ISODate, g: Granularity, weekStartsOn: 0 | 1): string[] {
  const out: string[] = [];
  if (g === 'day') return rangeKeys(start, end);
  if (g === 'week') {
    for (let k = startOfWeek(start, weekStartsOn); k <= end; k = addDays(k, 7)) out.push(k);
    return out;
  }
  if (g === 'month') {
    for (let k = startOfMonth(start); k <= end; k = addMonths(k, 1)) out.push(k.slice(0, 7));
    return out;
  }
  for (let y = +start.slice(0, 4); y <= +end.slice(0, 4); y++) out.push(String(y));
  return out;
}

export interface SeriesPoint {
  bucket: string;
  total: number;
  [categoryId: string]: number | string;
}

export function seriesByCategory(rows: Weighted[], start: ISODate, end: ISODate, g: Granularity, weekStartsOn: 0 | 1): SeriesPoint[] {
  const points = new Map<string, SeriesPoint>(bucketKeys(start, end, g, weekStartsOn).map((b) => [b, { bucket: b, total: 0 }]));
  for (const r of rows) {
    const p = points.get(bucketOf(r.entry.date, g, weekStartsOn));
    if (!p) continue;
    p.total += r.seconds;
    p[r.entry.categoryId] = ((p[r.entry.categoryId] as number) ?? 0) + r.seconds;
  }
  return [...points.values()];
}

export function dailyTotals(rows: Weighted[]): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const r of rows) m.set(r.entry.date, (m.get(r.entry.date) ?? 0) + r.seconds);
  return m;
}

export function sleepStats(rows: Weighted[]) {
  const sleep = rows.filter((r) => r.entry.method === 'sleep');
  const perDay = dailyTotals(sleep);
  const values = [...perDay.values()];
  const nights = values.length;
  const total = values.reduce((a, b) => a + b, 0);
  return {
    perDay,
    nights,
    average: nights ? total / nights : 0,
    min: nights ? Math.min(...values) : 0,
    max: nights ? Math.max(...values) : 0,
  };
}

export function comparePeriods(a: Weighted[], b: Weighted[], key: (e: TimeEntry) => string) {
  const ma = new Map(sumBy(a, key).map((x) => [x.key, x.seconds]));
  const mb = new Map(sumBy(b, key).map((x) => [x.key, x.seconds]));
  const keys = new Set([...ma.keys(), ...mb.keys()]);
  return [...keys]
    .map((k) => {
      const va = ma.get(k) ?? 0, vb = mb.get(k) ?? 0;
      return { key: k, a: va, b: vb, diff: va - vb, pct: vb ? (va - vb) / vb : null };
    })
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
}

export const daysInRange = (start: ISODate, end: ISODate) => diffDays(start, end) + 1;
