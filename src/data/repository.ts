import type {
  Activity, Category, EntrySubactivity, Goal, GoalLink, Settings, Snapshot, Subactivity, TimeEntry, TimerState,
} from '@/domain/types';

/** Colecciones persistidas. Mismo nombre que en Snapshot. */
export interface StoreMap {
  categories: Category;
  activities: Activity;
  subactivities: Subactivity;
  entries: TimeEntry;
  entrySubactivities: EntrySubactivity;
  goals: Goal;
  goalLinks: GoalLink;
  timer: TimerState;
  settings: Settings;
}
export type StoreName = keyof StoreMap;

export type Op = {
  [K in StoreName]: { type: 'put'; store: K; value: StoreMap[K] } | { type: 'delete'; store: K; key: string };
}[StoreName];

export const STORE_NAMES: StoreName[] = [
  'categories', 'activities', 'subactivities', 'entries', 'entrySubactivities', 'goals', 'goalLinks', 'timer', 'settings',
];

/**
 * Contrato de persistencia. La UI y el dominio solo conocen esta interfaz;
 * una implementación remota (p. ej. Supabase) puede sustituir a IndexedDB.
 */
export interface Repository {
  readonly kind: string;
  /** null si no hay datos (primera ejecución). */
  loadAll(): Promise<Snapshot | null>;
  /** Aplica todas las operaciones de forma atómica. */
  apply(ops: Op[]): Promise<void>;
  replaceAll(snapshot: Snapshot): Promise<void>;
}

/** Aplica operaciones a un Snapshot en memoria (misma semántica que el repositorio). */
export function applyOps(s: Snapshot, ops: Op[]): Snapshot {
  const next: Snapshot = { ...s };
  const touched = new Set<StoreName>();
  for (const op of ops) {
    if (op.store === 'settings') {
      if (op.type === 'put') next.settings = op.value;
      continue;
    }
    if (op.store === 'timer') {
      next.timer = op.type === 'put' ? op.value : next.timer?.entryId === op.key ? null : next.timer;
      continue;
    }
    const store = op.store;
    if (!touched.has(store)) {
      (next as unknown as Record<string, unknown[]>)[store] = [...(s[store] as unknown[])];
      touched.add(store);
    }
    const list = next[store] as { id: string }[];
    const key = op.type === 'put' ? op.value.id : op.key;
    const idx = list.findIndex((x) => x.id === key);
    if (op.type === 'put') {
      if (idx >= 0) list[idx] = op.value as { id: string };
      else list.push(op.value as { id: string });
    } else if (idx >= 0) list.splice(idx, 1);
  }
  return next;
}
