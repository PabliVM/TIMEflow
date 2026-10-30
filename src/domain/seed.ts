import { uuid } from './ids';
import type { Activity, Category, Snapshot, Subactivity } from './types';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from './types';

export const SEED_VERSION = 4;

/** Estructura inicial de categorías (configuración, no registros). */
const TREE: [string, string, [string, string[]][]][] = [
  ['App RM', '#3F76D9', []],
  ['App PV', '#2C8FB0', []],
  ['RM', '#8A7A12', []],
  ['Idiomas', '#C9761F', [['Inglés', ['Reading', 'Speaking']], ['Francés', ['Vocabulario']]]],
  ['Actividad física', '#1F8F75', [['Gimnasio', ['Pecho', 'Tríceps', 'Hombros']], ['Calistenia', ['Muscle-up', 'Handstand']]]],
  ['Ocio', '#7A5CCF', [['Golf', ['Campo', 'Práctica']], ['Lectura', []]]],
  ['Casita', '#9A5B2E', [['Manuela', []], ['Laura', []]]],
  ['Conducir', '#5E6E8C', [['Al trabajo', []]]],
  ['Descanso', '#B0485A', [['Sueño', ['Nocturno']], ['Recuperación', ['Siesta']]]],
];

export function buildSeed(now = new Date()): Snapshot {
  const t = now.toISOString();
  const base = { createdAt: t, updatedAt: t, archived: false };
  const categories: Category[] = [];
  const activities: Activity[] = [];
  const subactivities: Subactivity[] = [];
  const settings = { ...DEFAULT_SETTINGS, seedVersion: SEED_VERSION };
  TREE.forEach(([name, color, acts], ci) => {
    const c: Category = { ...base, id: uuid(), name, color, sortOrder: ci };
    categories.push(c);
    acts.forEach(([aname, subs], ai) => {
      const a: Activity = { ...base, id: uuid(), categoryId: c.id, name: aname, sortOrder: ai };
      activities.push(a);
      subs.forEach((sname, si) => {
        const s: Subactivity = { ...base, id: uuid(), activityId: a.id, name: sname, sortOrder: si };
        subactivities.push(s);
        if (aname === 'Sueño' && sname === 'Nocturno') {
          settings.sleepCategoryId = c.id;
          settings.sleepActivityId = a.id;
          settings.sleepSubactivityId = s.id;
        }
      });
    });
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    categories,
    activities,
    subactivities,
    entries: [],
    entrySubactivities: [],
    goals: [],
    goalLinks: [],
    settings,
    timer: null,
  };
}
