import { CATEGORY_COLORS } from '@/domain/hierarchy';
import { uuid } from '@/domain/ids';
import { SEED_VERSION } from '@/domain/seed';
import type { Snapshot } from '@/domain/types';
import type { Op } from './repository';

const lower = (s: string) => s.toLocaleLowerCase('es');

/** Ajustes de categorías sobre datos ya guardados. Idempotente. */
export function migrationOps(s: Snapshot, now = new Date().toISOString()): Op[] {
  const version = s.settings.seedVersion ?? 1;
  if (version >= SEED_VERSION) return [];
  const ops: Op[] = [];
  if (version < 2) ops.push(...v2(s, now));
  if (version < 3) ops.push(...v3(s, now));
  if (version < 4) ops.push(...v4(s, now));
  ops.push({ type: 'put', store: 'settings', value: { ...s.settings, seedVersion: SEED_VERSION } });
  return ops;
}

/** v2: sustituye "Desarrollo profesional" por App RM, App PV y RM. Conserva históricos. */
function v2(s: Snapshot, now: string): Op[] {
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
  return ops;
}

/** v3: categoría Casita con actividades Manuela y Laura. */
function v3(s: Snapshot, now: string): Op[] {
  const ops: Op[] = [];
  let cat = s.categories.find((c) => lower(c.name) === 'casita');
  if (!cat) {
    const sortOrder = s.categories.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;
    cat = { id: uuid(), name: 'Casita', color: CATEGORY_COLORS[10], sortOrder, archived: false, createdAt: now, updatedAt: now };
    ops.push({ type: 'put', store: 'categories', value: cat });
  }
  const categoryId = cat.id;
  const acts = s.activities.filter((a) => a.categoryId === categoryId);
  let order = acts.reduce((m, a) => Math.max(m, a.sortOrder), -1) + 1;
  for (const name of ['Manuela', 'Laura']) {
    if (acts.some((a) => lower(a.name) === lower(name))) continue;
    ops.push({ type: 'put', store: 'activities', value: { id: uuid(), categoryId, name, sortOrder: order++, archived: false, createdAt: now, updatedAt: now } });
  }
  return ops;
}

/** Ids fijos: si varios dispositivos aplican la migración, la sincronización no duplica. */
const CONDUCIR_ID = '7c3a1d2e-4b5f-4a6c-9d8e-0f1a2b3c4d01';
const AL_TRABAJO_ID = '7c3a1d2e-4b5f-4a6c-9d8e-0f1a2b3c4d02';

/** v4: categoría Conducir con la actividad Al trabajo. */
function v4(s: Snapshot, now: string): Op[] {
  const ops: Op[] = [];
  let cat = s.categories.find((c) => lower(c.name) === 'conducir');
  if (!cat) {
    const sortOrder = s.categories.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;
    cat = { id: CONDUCIR_ID, name: 'Conducir', color: CATEGORY_COLORS[7], sortOrder, archived: false, createdAt: now, updatedAt: now };
    ops.push({ type: 'put', store: 'categories', value: cat });
  }
  const categoryId = cat.id;
  const acts = s.activities.filter((a) => a.categoryId === categoryId);
  if (!acts.some((a) => lower(a.name) === 'al trabajo')) {
    const sortOrder = acts.reduce((m, a) => Math.max(m, a.sortOrder), -1) + 1;
    ops.push({ type: 'put', store: 'activities', value: { id: AL_TRABAJO_ID, categoryId, name: 'Al trabajo', sortOrder, archived: false, createdAt: now, updatedAt: now } });
  }
  return ops;
}
