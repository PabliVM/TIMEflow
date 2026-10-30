import type { Snapshot } from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';
import type { Op, StoreMap, StoreName } from './repository';
import { STORE_NAMES } from './repository';

export interface RemoteRow {
  store: string;
  id: string;
  data: unknown;
  deleted: boolean;
  updated_at: string;
}

export const recordId = (store: StoreName, value: { id?: string; entryId?: string }) =>
  (store === 'timer' ? value.entryId : value.id) as string;

const isStore = (s: string): s is StoreName => (STORE_NAMES as string[]).includes(s);

export function rowsToOps(rows: RemoteRow[]): Op[] {
  return rows
    .filter((r) => isStore(r.store))
    .map((r) =>
      r.deleted
        ? ({ type: 'delete', store: r.store, key: r.id } as Op)
        : ({ type: 'put', store: r.store, value: r.data } as Op),
    );
}

export function rowsToSnapshot(rows: RemoteRow[], fallback: Snapshot): Snapshot {
  const live = rows.filter((r) => !r.deleted && isStore(r.store));
  const of = <K extends StoreName>(k: K) => live.filter((r) => r.store === k).map((r) => r.data as StoreMap[K]);
  return {
    schemaVersion: SCHEMA_VERSION,
    categories: of('categories'),
    activities: of('activities'),
    subactivities: of('subactivities'),
    entries: of('entries'),
    entrySubactivities: of('entrySubactivities'),
    goals: of('goals'),
    goalLinks: of('goalLinks'),
    settings: of('settings')[0] ?? fallback.settings,
    timer: of('timer')[0] ?? null,
  };
}

/** Todas las filas de un snapshot como operaciones put. */
export function snapshotOps(s: Snapshot): Op[] {
  const ops: Op[] = [];
  for (const store of STORE_NAMES) {
    const values: unknown[] = store === 'settings' ? [s.settings] : store === 'timer' ? (s.timer ? [s.timer] : []) : (s[store] as unknown[]);
    for (const value of values) ops.push({ type: 'put', store, value } as Op);
  }
  return ops;
}

const lower = (s: string) => s.trim().toLocaleLowerCase('es');

/**
 * Primer inicio de sesión en un dispositivo con datos propios y nube no vacía:
 * combina por nombre (categoría › actividad › subactividad) para no duplicar,
 * reasigna referencias y devuelve lo que hay que subir.
 */
export function mergeIntoRemote(remote: Snapshot, local: Snapshot): { merged: Snapshot; push: Op[] } {
  const push: Op[] = [];
  const merged: Snapshot = {
    ...remote,
    categories: [...remote.categories],
    activities: [...remote.activities],
    subactivities: [...remote.subactivities],
    entries: [...remote.entries],
    entrySubactivities: [...remote.entrySubactivities],
    goals: [...remote.goals],
    goalLinks: [...remote.goalLinks],
  };
  const add = <K extends Exclude<StoreName, 'settings' | 'timer'>>(store: K, value: StoreMap[K]) => {
    (merged[store] as StoreMap[K][]).push(value);
    push.push({ type: 'put', store, value } as Op);
  };

  const cat = new Map<string, string>();
  for (const c of local.categories) {
    const hit = remote.categories.find((r) => r.id === c.id || lower(r.name) === lower(c.name));
    if (hit) cat.set(c.id, hit.id);
    else {
      cat.set(c.id, c.id);
      add('categories', c);
    }
  }
  const act = new Map<string, string>();
  for (const a of local.activities) {
    const categoryId = cat.get(a.categoryId) ?? a.categoryId;
    const hit = merged.activities.find((r) => r.id === a.id || (r.categoryId === categoryId && lower(r.name) === lower(a.name)));
    if (hit) act.set(a.id, hit.id);
    else {
      act.set(a.id, a.id);
      add('activities', { ...a, categoryId });
    }
  }
  const sub = new Map<string, string>();
  for (const x of local.subactivities) {
    const activityId = act.get(x.activityId) ?? x.activityId;
    const hit = merged.subactivities.find((r) => r.id === x.id || (r.activityId === activityId && lower(r.name) === lower(x.name)));
    if (hit) sub.set(x.id, hit.id);
    else {
      sub.set(x.id, x.id);
      add('subactivities', { ...x, activityId });
    }
  }

  const goalIds = new Set(remote.goals.map((g) => g.id));
  for (const g of local.goals) {
    if (goalIds.has(g.id)) continue;
    add('goals', { ...g, categoryId: g.categoryId && (cat.get(g.categoryId) ?? g.categoryId) });
  }
  const linkIds = new Set(remote.goalLinks.map((l) => l.id));
  for (const l of local.goalLinks) {
    if (linkIds.has(l.id)) continue;
    add('goalLinks', {
      ...l,
      activityId: l.activityId && (act.get(l.activityId) ?? l.activityId),
      subactivityId: l.subactivityId && (sub.get(l.subactivityId) ?? l.subactivityId),
    });
  }

  const entryIds = new Set(remote.entries.map((e) => e.id));
  const newEntries = new Set<string>();
  for (const e of local.entries) {
    if (entryIds.has(e.id)) continue;
    newEntries.add(e.id);
    add('entries', {
      ...e,
      categoryId: cat.get(e.categoryId) ?? e.categoryId,
      activityId: e.activityId && (act.get(e.activityId) ?? e.activityId),
    });
  }
  for (const l of local.entrySubactivities) {
    if (!newEntries.has(l.entryId)) continue;
    add('entrySubactivities', { ...l, subactivityId: sub.get(l.subactivityId) ?? l.subactivityId });
  }

  if (!merged.timer && local.timer) {
    const d = local.timer.draft;
    merged.timer = {
      ...local.timer,
      draft: {
        ...d,
        categoryId: cat.get(d.categoryId) ?? d.categoryId,
        activityId: d.activityId && (act.get(d.activityId) ?? d.activityId),
        subactivities: d.subactivities.map((s) => ({ ...s, subactivityId: sub.get(s.subactivityId) ?? s.subactivityId })),
      },
    };
    push.push({ type: 'put', store: 'timer', value: merged.timer });
  }
  return { merged, push };
}
