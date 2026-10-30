import { CATEGORY_COLORS } from '@/domain/hierarchy';
import { uuid } from '@/domain/ids';
import { SEED_VERSION } from '@/domain/seed';
import type { Snapshot } from '@/domain/types';
import type { Op } from './repository';

const lower = (s: string) => s.toLocaleLowerCase('es');

/** v2: sustituye "Desarrollo profesional" por App RM, App PV y RM. Conserva históricos. */
export function migrationOps(s: Snapshot, now = new Date().toISOString()): Op[] {
  if ((s.settings.seedVersion ?? 1) >= SEED_VERSION) return [];
  const ops: Op[] = [];
  const old = s.categories.find((c) => lower(c.name) === 'desarrollo profesional');
  if (old) {
    const used = s.entries.some((e) => e.categoryId === old.id) || s.goals.some((g) => g.categoryId === old.id);
    if (used) {
      ops.push({ type: 'put', store: 'categories', value: { ...old, archived: true, updatedAt: now } });
    } else {
      const acts = s.activities.filter((a) => a.categoryId === old.id);
      const actIds = new Set(acts.map((a) => a.id));
      const subs = s.subactivities.filter((x) => actIds.has(x.activityId));
      const subIds = new Set(subs.map((x) => x.id));
      ops.push({ type: 'delete', store: 'categories', key: old.id });
      acts.forEach((a) => ops.push({ type: 'delete', store: 'activities', key: a.id }));
      subs.forEach((x) => ops.push({ type: 'delete', store: 'subactivities', key: x.id }));
      s.goalLinks
        .filter((l) => (l.activityId && actIds.has(l.activityId)) || (l.subactivityId && subIds.has(l.subactivityId)))
        .forEach((l) => ops.push({ type: 'delete', store: 'goalLinks', key: l.id }));
    }
  }
  const min = s.categories.reduce((m, c) => Math.min(m, c.sortOrder), 0);
  [['App RM', CATEGORY_COLORS[0]], ['App PV', CATEGORY_COLORS[5]], ['RM', CATEGORY_COLORS[6]]].forEach(([name, color], i) => {
    if (s.categories.some((c) => lower(c.name) === lower(name))) return;
    ops.push({
      type: 'put',
      store: 'categories',
      value: { id: uuid(), name, color, sortOrder: min - 3 + i, archived: false, createdAt: now, updatedAt: now },
    });
  });
  ops.push({ type: 'put', store: 'settings', value: { ...s.settings, seedVersion: SEED_VERSION } });
  return ops;
}
