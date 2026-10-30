import type { Activity, Category, EntrySubactivity, Snapshot, Subactivity, TimeEntry } from './types';

export const CATEGORY_COLORS = [
  '#3F76D9', '#C9761F', '#1F8F75', '#7A5CCF', '#B0485A', '#2C8FB0',
  '#8A7A12', '#5E6E8C', '#C25E9A', '#4F8A3C', '#9A5B2E', '#4655B8',
];

export const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ');

export function isDuplicateName<T extends { id: string; name: string }>(siblings: T[], name: string, excludeId?: string): boolean {
  const n = normalizeName(name).toLocaleLowerCase('es');
  return siblings.some((s) => s.id !== excludeId && s.name.toLocaleLowerCase('es') === n);
}

export const bySort = <T extends { sortOrder: number; name: string }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es');

export interface Lookup {
  category: Map<string, Category>;
  activity: Map<string, Activity>;
  subactivity: Map<string, Subactivity>;
}

export function buildLookup(s: Pick<Snapshot, 'categories' | 'activities' | 'subactivities'>): Lookup {
  return {
    category: new Map(s.categories.map((c) => [c.id, c])),
    activity: new Map(s.activities.map((a) => [a.id, a])),
    subactivity: new Map(s.subactivities.map((x) => [x.id, x])),
  };
}

export const categoryColor = (lk: Lookup, categoryId: string) => lk.category.get(categoryId)?.color ?? '#7C8798';

/** Nombre más específico del registro. */
export function entryLabel(entry: TimeEntry, subs: EntrySubactivity[], lk: Lookup): string {
  if (subs.length === 1) {
    const sub = lk.subactivity.get(subs[0].subactivityId);
    if (sub) return sub.name;
  }
  if (entry.activityId) {
    const a = lk.activity.get(entry.activityId);
    if (a) return a.name;
  }
  return lk.category.get(entry.categoryId)?.name ?? 'Sin categoría';
}

export function entryPath(entry: TimeEntry, lk: Lookup): string {
  const parts = [lk.category.get(entry.categoryId)?.name ?? 'Sin categoría'];
  if (entry.activityId) parts.push(lk.activity.get(entry.activityId)?.name ?? '—');
  return parts.join(' › ');
}

export function nextSortOrder(items: { sortOrder: number }[]): number {
  return items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
}
