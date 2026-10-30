export type ID = string;
/** Día local, formato YYYY-MM-DD. */
export type ISODate = string;
/** Instante absoluto ISO 8601 (UTC, sufijo Z). */
export type ISODateTime = string;

interface Base {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Category extends Base {
  name: string;
  color: string;
  sortOrder: number;
  archived: boolean;
}

export interface Activity extends Base {
  categoryId: ID;
  name: string;
  sortOrder: number;
  archived: boolean;
}

export interface Subactivity extends Base {
  activityId: ID;
  name: string;
  sortOrder: number;
  archived: boolean;
}

export type EntryMethod = 'duration' | 'range' | 'timer' | 'pomodoro' | 'sleep';

export interface TimeEntry extends Base {
  /** Día al que se asigna el registro (el sueño nocturno: día de despertar). */
  date: ISODate;
  categoryId: ID;
  activityId?: ID;
  startAt?: ISODateTime;
  endAt?: ISODateTime;
  /** Zona horaria IANA en la que se registró. */
  timeZone: string;
  durationSeconds: number;
  pausedSeconds?: number;
  method: EntryMethod;
  goalId?: ID;
  sleepQuality?: number;
  notes: string;
}

export interface EntrySubactivity {
  id: ID;
  entryId: ID;
  subactivityId: ID;
  /** Tiempo individual conocido, incluido en el total del registro. */
  durationSeconds?: number;
}

export type GoalType = 'time' | 'frequency' | 'result';
export type GoalStatus = 'pending' | 'in_progress' | 'achieved';

export interface Goal extends Base {
  name: string;
  description: string;
  categoryId?: ID;
  type: GoalType;
  /** Segundos (tiempo) o número de sesiones (frecuencia). */
  targetValue?: number;
  startDate: ISODate;
  targetDate?: ISODate;
  status: GoalStatus;
  completedAt?: ISODateTime;
  archived: boolean;
  showTenThousand: boolean;
}

export interface GoalLink {
  id: ID;
  goalId: ID;
  activityId?: ID;
  subactivityId?: ID;
}

export interface EntryDraft {
  categoryId: ID;
  activityId?: ID;
  subactivities: { subactivityId: ID; durationSeconds?: number }[];
  goalId?: ID;
  notes: string;
}

export type TimerMode = 'normal' | 'pomodoro';

export interface TimerState {
  /** Id del registro que se creará al finalizar (evita duplicados). */
  entryId: ID;
  startedAt: ISODateTime;
  pausedAt?: ISODateTime;
  accumulatedPauseSeconds: number;
  mode: TimerMode;
  plannedDurationSeconds?: number;
  status: 'running' | 'paused';
  timeZone: string;
  draft: EntryDraft;
}

export type CalendarView = 'day' | 'week' | 'month';

export interface Settings {
  id: 'settings';
  theme: 'system' | 'light' | 'dark';
  defaultCalendarView: CalendarView;
  weekStartsOn: 0 | 1;
  /** Minutos. */
  pomodoroDurations: number[];
  use24h: boolean;
  sleepCategoryId?: ID;
  sleepActivityId?: ID;
  sleepSubactivityId?: ID;
  /** Valores no reconocidos (p. ej. 'flowers' antiguo) se tratan como 'forest'. */
  background?: 'forest' | 'stars' | 'plain' | 'flowers';
  /** Versión de la estructura inicial aplicada (migraciones de categorías). */
  seedVersion?: number;
}

export interface Snapshot {
  schemaVersion: number;
  categories: Category[];
  activities: Activity[];
  subactivities: Subactivity[];
  entries: TimeEntry[];
  entrySubactivities: EntrySubactivity[];
  goals: Goal[];
  goalLinks: GoalLink[];
  settings: Settings;
  timer: TimerState | null;
}

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  theme: 'system',
  defaultCalendarView: 'week',
  weekStartsOn: 1,
  pomodoroDurations: [25, 45, 60],
  use24h: true,
};

export const METHOD_LABEL: Record<EntryMethod, string> = {
  duration: 'Duración',
  range: 'Horario',
  timer: 'Temporizador',
  pomodoro: 'Pomodoro',
  sleep: 'Sueño',
};

export const MAX_ENTRY_SECONDS = 24 * 3600;
