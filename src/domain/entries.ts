import { addDays, localDateTime, toDateKey } from './time';
import type { EntrySubactivity, ISODate, TimeEntry } from './types';
import { MAX_ENTRY_SECONDS } from './types';

export interface TimeRange {
  startAt: string;
  endAt: string;
  seconds: number;
  crossesMidnight: boolean;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Inicio/fin en un día local. Si fin <= inicio se asume que termina al día siguiente. */
export function computeRange(dateKey: ISODate, start: string, end: string): TimeRange | null {
  if (!HHMM.test(start) || !HHMM.test(end) || start === end) return null;
  const s = localDateTime(dateKey, start);
  let e = localDateTime(dateKey, end);
  let crossesMidnight = false;
  if (e <= s) {
    e = localDateTime(addDays(dateKey, 1), end);
    crossesMidnight = true;
  }
  return {
    startAt: s.toISOString(),
    endAt: e.toISOString(),
    seconds: Math.round((e.getTime() - s.getTime()) / 1000),
    crossesMidnight,
  };
}

export interface SleepRange {
  startAt: string;
  endAt: string;
  seconds: number;
  /** El sueño se asigna al día de despertar. */
  date: ISODate;
}

export function computeSleep(bed: Date, wake: Date): SleepRange | null {
  const seconds = Math.round((wake.getTime() - bed.getTime()) / 1000);
  if (!(seconds > 0) || seconds > MAX_ENTRY_SECONDS) return null;
  return { startAt: bed.toISOString(), endAt: wake.toISOString(), seconds, date: toDateKey(wake) };
}

export interface EntryValidationInput {
  categoryId?: string;
  durationSeconds: number;
  subactivities: { durationSeconds?: number }[];
}

export function validateEntry(input: EntryValidationInput): string[] {
  const errors: string[] = [];
  if (!input.categoryId) errors.push('Elige una categoría.');
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0)
    errors.push('La duración debe ser mayor que 0.');
  else if (input.durationSeconds > MAX_ENTRY_SECONDS) errors.push('Un registro no puede superar 24 h.');
  const known = input.subactivities.map((s) => s.durationSeconds ?? 0);
  if (known.some((v) => v < 0 || !Number.isFinite(v))) errors.push('Los tiempos de subactividad no pueden ser negativos.');
  if (known.reduce((a, b) => a + b, 0) > input.durationSeconds)
    errors.push('La suma de tiempos de subactividades supera la duración total.');
  return errors;
}

/** Con horario primero (cronológico); después sin horario por orden de creación. */
export function sortDayEntries(entries: TimeEntry[]): TimeEntry[] {
  const timed = entries.filter((e) => e.startAt).sort((a, b) => a.startAt!.localeCompare(b.startAt!));
  const untimed = entries.filter((e) => !e.startAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...timed, ...untimed];
}

/**
 * Tiempo atribuible a una subactividad dentro de un registro.
 * null → la subactividad no está en el registro.
 * Sin tiempo individual: si es la única subactividad, el registro está hecho a ese nivel
 * y cuenta la duración completa; si hay varias, cuenta como realizada sin horas (0).
 */
export function subactivitySeconds(entry: TimeEntry, links: EntrySubactivity[], subId: string): number | null {
  const link = links.find((l) => l.subactivityId === subId);
  if (!link) return null;
  if (link.durationSeconds != null) return Math.min(link.durationSeconds, entry.durationSeconds);
  return links.length === 1 ? entry.durationSeconds : 0;
}

export function groupSubsByEntry(subs: EntrySubactivity[]): Map<string, EntrySubactivity[]> {
  const map = new Map<string, EntrySubactivity[]>();
  for (const s of subs) {
    const list = map.get(s.entryId);
    if (list) list.push(s);
    else map.set(s.entryId, [s]);
  }
  return map;
}
