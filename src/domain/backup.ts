import { formatDuration } from './format';
import { buildLookup } from './hierarchy';
import { groupSubsByEntry } from './entries';
import { DEFAULT_SETTINGS, METHOD_LABEL, SCHEMA_VERSION } from './types';
import type { Snapshot, TimeEntry } from './types';

export interface BackupFile {
  app: 'timeflow';
  schemaVersion: number;
  exportedAt: string;
  data: Omit<Snapshot, 'timer'> & { timer?: Snapshot['timer'] };
}

export function toBackup(s: Snapshot): BackupFile {
  return { app: 'timeflow', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: s };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown) => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

export interface BackupValidation {
  ok: boolean;
  errors: string[];
  snapshot?: Snapshot;
}

type Check = (item: Record<string, unknown>) => boolean;

const CHECKS: Record<string, Check> = {
  categories: (x) => isStr(x.id) && isStr(x.name) && isStr(x.color) && isNum(x.sortOrder),
  activities: (x) => isStr(x.id) && isStr(x.categoryId) && isStr(x.name) && isNum(x.sortOrder),
  subactivities: (x) => isStr(x.id) && isStr(x.activityId) && isStr(x.name) && isNum(x.sortOrder),
  entries: (x) =>
    isStr(x.id) && isStr(x.categoryId) && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
    isNum(x.durationSeconds) && (x.durationSeconds as number) >= 0 && isStr(x.method),
  entrySubactivities: (x) => isStr(x.id) && isStr(x.entryId) && isStr(x.subactivityId),
  goals: (x) => isStr(x.id) && isStr(x.name) && isStr(x.type) && isStr(x.startDate),
  goalLinks: (x) => isStr(x.id) && isStr(x.goalId),
};

export function validateBackup(raw: unknown): BackupValidation {
  const errors: string[] = [];
  if (!isObj(raw) || raw.app !== 'timeflow' || !isObj(raw.data)) {
    return { ok: false, errors: ['El archivo no es una copia de TIMEFLOW.'] };
  }
  if (!isNum(raw.schemaVersion) || (raw.schemaVersion as number) > SCHEMA_VERSION) {
    errors.push('Versión de copia no compatible.');
  }
  const data = raw.data;
  for (const [key, check] of Object.entries(CHECKS)) {
    const list = data[key];
    if (!Array.isArray(list)) {
      errors.push(`Falta la colección "${key}".`);
      continue;
    }
    const ids = new Set<string>();
    list.forEach((item, i) => {
      if (!isObj(item) || !check(item)) errors.push(`${key}[${i}] tiene un formato inválido.`);
      else if (ids.has(item.id as string)) errors.push(`${key}: id duplicado ${item.id}.`);
      else ids.add(item.id as string);
    });
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };

  const s = data as unknown as Snapshot;
  const cat = new Set(s.categories.map((c) => c.id));
  const act = new Set(s.activities.map((a) => a.id));
  const sub = new Set(s.subactivities.map((a) => a.id));
  const ent = new Set(s.entries.map((e) => e.id));
  const goal = new Set(s.goals.map((g) => g.id));
  s.activities.forEach((a) => !cat.has(a.categoryId) && errors.push(`Actividad "${a.name}" sin categoría.`));
  s.subactivities.forEach((x) => !act.has(x.activityId) && errors.push(`Subactividad "${x.name}" sin actividad.`));
  s.entries.forEach((e) => {
    if (!cat.has(e.categoryId)) errors.push(`Registro ${e.date} con categoría inexistente.`);
    if (e.activityId && !act.has(e.activityId)) errors.push(`Registro ${e.date} con actividad inexistente.`);
  });
  s.entrySubactivities.forEach((l) => {
    if (!ent.has(l.entryId) || !sub.has(l.subactivityId)) errors.push('Relación registro–subactividad rota.');
  });
  s.goalLinks.forEach((l) => !goal.has(l.goalId) && errors.push('Vínculo de objetivo roto.'));
  if (errors.length) return { ok: false, errors: [...new Set(errors)].slice(0, 20) };

  const settings = { ...DEFAULT_SETTINGS, ...(isObj(data.settings) ? data.settings : {}), id: 'settings' as const };
  return {
    ok: true,
    errors: [],
    snapshot: {
      schemaVersion: SCHEMA_VERSION,
      categories: s.categories,
      activities: s.activities,
      subactivities: s.subactivities,
      entries: s.entries,
      entrySubactivities: s.entrySubactivities,
      goals: s.goals,
      goalLinks: s.goalLinks,
      settings,
      timer: null,
    },
  };
}

const csvCell = (v: string | number | undefined) => {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (separador ";", compatible con Excel en español). Una fila por registro: sin duplicar duración. */
export function entriesToCsv(s: Snapshot, entries: TimeEntry[]): string {
  const lk = buildLookup(s);
  const subsBy = groupSubsByEntry(s.entrySubactivities);
  const goals = new Map(s.goals.map((g) => [g.id, g.name]));
  const header = ['Fecha', 'Categoría', 'Actividad', 'Subactividades', 'Inicio', 'Fin', 'Duración', 'Duración (s)', 'Método', 'Objetivo', 'Calidad sueño', 'Notas'];
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startAt ?? '').localeCompare(b.startAt ?? ''))
    .map((e) => {
      const subs = (subsBy.get(e.id) ?? [])
        .map((l) => {
          const n = lk.subactivity.get(l.subactivityId)?.name ?? '?';
          return l.durationSeconds != null ? `${n} (${formatDuration(l.durationSeconds)})` : n;
        })
        .join(', ');
      return [
        e.date,
        lk.category.get(e.categoryId)?.name,
        e.activityId ? lk.activity.get(e.activityId)?.name : '',
        subs,
        e.startAt ?? '',
        e.endAt ?? '',
        formatDuration(e.durationSeconds),
        e.durationSeconds,
        METHOD_LABEL[e.method],
        e.goalId ? goals.get(e.goalId) : '',
        e.sleepQuality ?? '',
        e.notes,
      ].map(csvCell).join(';');
    });
  return '﻿' + [header.join(';'), ...rows].join('\r\n');
}
