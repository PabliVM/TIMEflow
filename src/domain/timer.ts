import { uuid } from './ids';
import { toDateKey } from './time';
import type { EntryDraft, EntrySubactivity, TimeEntry, TimerMode, TimerState } from './types';

const ms = (iso: string) => new Date(iso).getTime();

export function createTimer(draft: EntryDraft, mode: TimerMode, now: Date, timeZone: string, plannedSeconds?: number): TimerState {
  return {
    entryId: uuid(),
    startedAt: now.toISOString(),
    accumulatedPauseSeconds: 0,
    mode,
    plannedDurationSeconds: mode === 'pomodoro' ? plannedSeconds : undefined,
    status: 'running',
    timeZone,
    draft,
  };
}

/** Segundos activos calculados con marcas temporales reales (pausas descontadas). */
export function elapsedSeconds(t: TimerState, now: Date): number {
  const end = t.status === 'paused' && t.pausedAt ? ms(t.pausedAt) : now.getTime();
  return Math.max(0, (end - ms(t.startedAt)) / 1000 - t.accumulatedPauseSeconds);
}

export function pauseTimer(t: TimerState, now: Date): TimerState {
  if (t.status !== 'running') return t;
  return { ...t, status: 'paused', pausedAt: now.toISOString() };
}

export function resumeTimer(t: TimerState, now: Date): TimerState {
  if (t.status !== 'paused' || !t.pausedAt) return t;
  const pause = Math.max(0, (now.getTime() - ms(t.pausedAt)) / 1000);
  return { ...t, status: 'running', pausedAt: undefined, accumulatedPauseSeconds: t.accumulatedPauseSeconds + pause };
}

export function remainingSeconds(t: TimerState, now: Date): number | null {
  if (t.mode !== 'pomodoro' || !t.plannedDurationSeconds) return null;
  return Math.max(0, t.plannedDurationSeconds - elapsedSeconds(t, now));
}

export const isPomodoroComplete = (t: TimerState, now: Date) => remainingSeconds(t, now) === 0;

/**
 * Convierte el temporizador en registro. Un pomodoro completado se cierra en el instante
 * exacto en que se cumplió, aunque la app estuviera cerrada.
 */
export function finalizeTimer(t: TimerState, now: Date): { entry: TimeEntry; subs: EntrySubactivity[] } {
  let end = t.status === 'paused' && t.pausedAt ? new Date(t.pausedAt) : now;
  let active = elapsedSeconds(t, now);
  if (t.mode === 'pomodoro' && t.plannedDurationSeconds && active >= t.plannedDurationSeconds) {
    active = t.plannedDurationSeconds;
    end = new Date(ms(t.startedAt) + (t.plannedDurationSeconds + t.accumulatedPauseSeconds) * 1000);
  }
  const seconds = Math.max(1, Math.round(active));
  const start = new Date(t.startedAt);
  const stamp = now.toISOString();
  const entry: TimeEntry = {
    id: t.entryId,
    date: toDateKey(start),
    categoryId: t.draft.categoryId,
    activityId: t.draft.activityId,
    startAt: t.startedAt,
    endAt: end.toISOString(),
    timeZone: t.timeZone,
    durationSeconds: seconds,
    pausedSeconds: Math.round(t.accumulatedPauseSeconds),
    method: t.mode === 'pomodoro' ? 'pomodoro' : 'timer',
    goalId: t.draft.goalId,
    notes: t.draft.notes,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const subs = t.draft.subactivities.map((s) => ({
    id: uuid(),
    entryId: entry.id,
    subactivityId: s.subactivityId,
    durationSeconds: s.durationSeconds != null ? Math.min(s.durationSeconds, seconds) : undefined,
  }));
  return { entry, subs };
}
