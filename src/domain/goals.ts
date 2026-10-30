import { subactivitySeconds } from './entries';
import type { EntrySubactivity, Goal, GoalLink, TimeEntry } from './types';

export interface Contribution {
  matched: boolean;
  seconds: number;
}

/**
 * Aporte de un registro a un objetivo. Un registro cuenta como máximo una vez:
 * - vinculado explícitamente o por actividad/categoría → duración completa;
 * - por subactividades → solo el tiempo individual conocido (sin inventar horas).
 */
export function goalContribution(goal: Goal, links: GoalLink[], entry: TimeEntry, subs: EntrySubactivity[]): Contribution {
  if (entry.goalId === goal.id) return { matched: true, seconds: entry.durationSeconds };
  let matched = false;
  let full = false;
  let partial = 0;
  if (!links.length && goal.categoryId && entry.categoryId === goal.categoryId) matched = full = true;
  for (const l of links) {
    if (l.subactivityId) {
      const s = subactivitySeconds(entry, subs, l.subactivityId);
      if (s !== null) {
        matched = true;
        partial += s;
      }
    } else if (l.activityId && entry.activityId === l.activityId) {
      matched = full = true;
    }
  }
  if (!matched) return { matched: false, seconds: 0 };
  return { matched, seconds: full ? entry.durationSeconds : Math.min(partial, entry.durationSeconds) };
}

export interface GoalProgress {
  seconds: number;
  count: number;
  allTimeSeconds: number;
  ratio: number | null;
  /** Aportes por día (para la evolución). */
  byDate: Map<string, { seconds: number; count: number }>;
}

export function goalProgress(
  goal: Goal,
  links: GoalLink[],
  entries: TimeEntry[],
  subsByEntry: Map<string, EntrySubactivity[]>,
): GoalProgress {
  let seconds = 0, count = 0, allTimeSeconds = 0;
  const byDate = new Map<string, { seconds: number; count: number }>();
  for (const e of entries) {
    const c = goalContribution(goal, links, e, subsByEntry.get(e.id) ?? []);
    if (!c.matched) continue;
    allTimeSeconds += c.seconds;
    if (e.date < goal.startDate) continue;
    seconds += c.seconds;
    count += 1;
    const d = byDate.get(e.date) ?? { seconds: 0, count: 0 };
    d.seconds += c.seconds;
    d.count += 1;
    byDate.set(e.date, d);
  }
  let ratio: number | null = null;
  if (goal.type === 'time' && goal.targetValue) ratio = seconds / goal.targetValue;
  else if (goal.type === 'frequency' && goal.targetValue) ratio = count / goal.targetValue;
  else if (goal.type === 'result') ratio = goal.status === 'achieved' ? 1 : null;
  return { seconds, count, allTimeSeconds, ratio, byDate };
}

export const TEN_THOUSAND_HOURS = 10000 * 3600;

export const GOAL_STATUS_LABEL = { pending: 'Pendiente', in_progress: 'En progreso', achieved: 'Conseguido' } as const;
export const GOAL_TYPE_LABEL = { time: 'Tiempo', frequency: 'Frecuencia', result: 'Resultado' } as const;
