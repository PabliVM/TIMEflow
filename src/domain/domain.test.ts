import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IndexedDBRepository } from '../data/indexeddb';
import { applyOps } from '../data/repository';
import { toBackup, validateBackup } from './backup';
import { computeRange, computeSleep, subactivitySeconds, validateEntry } from './entries';
import { goalProgress } from './goals';
import { buildSeed } from './seed';
import { applyFilter } from './stats';
import { createTimer, elapsedSeconds, finalizeTimer, pauseTimer, resumeTimer } from './timer';
import type { EntrySubactivity, Goal, TimeEntry } from './types';

const T = '2026-10-30T10:00:00.000Z';
const entry = (p: Partial<TimeEntry>): TimeEntry => ({
  id: 'e1', date: '2026-10-30', categoryId: 'c', durationSeconds: 3600, method: 'duration', timeZone: 'UTC', notes: '', createdAt: T, updatedAt: T, ...p,
});

test('horario cruzando medianoche', () => {
  const r = computeRange('2026-10-30', '23:30', '00:15')!;
  assert.equal(r.seconds, 45 * 60);
  assert.equal(r.crossesMidnight, true);
  assert.equal(computeRange('2026-10-30', '10:00', '10:00'), null);
});

test('sueño se asigna al día de despertar', () => {
  const s = computeSleep(new Date(2026, 9, 29, 22, 30), new Date(2026, 9, 30, 7, 0))!;
  assert.equal(s.seconds, 8.5 * 3600);
  assert.equal(s.date, '2026-10-30');
  assert.equal(computeSleep(new Date(2026, 9, 30, 8), new Date(2026, 9, 30, 7)), null);
});

test('validación: subactividades no superan el total, sin negativos', () => {
  assert.equal(validateEntry({ categoryId: 'c', durationSeconds: 3600, subactivities: [{ durationSeconds: 900 }, {}] }).length, 0);
  assert.ok(validateEntry({ categoryId: 'c', durationSeconds: 600, subactivities: [{ durationSeconds: 900 }] }).length);
  assert.ok(validateEntry({ categoryId: 'c', durationSeconds: -5, subactivities: [] }).length);
});

test('temporizador descuenta pausas con timestamps reales', () => {
  const t0 = new Date('2026-10-30T10:00:00Z');
  let t = createTimer({ categoryId: 'c', subactivities: [], notes: '' }, 'normal', t0, 'UTC');
  t = pauseTimer(t, new Date('2026-10-30T10:20:00Z'));
  assert.equal(elapsedSeconds(t, new Date('2026-10-30T11:00:00Z')), 1200);
  t = resumeTimer(t, new Date('2026-10-30T10:30:00Z'));
  const { entry: e } = finalizeTimer(t, new Date('2026-10-30T10:45:00Z'));
  assert.equal(e.durationSeconds, 35 * 60);
  assert.equal(e.pausedSeconds, 600);
  assert.equal(e.id, t.entryId);
});

test('pomodoro completado se cierra en su instante exacto', () => {
  const t = createTimer({ categoryId: 'c', subactivities: [], notes: '' }, 'pomodoro', new Date('2026-10-30T10:00:00Z'), 'UTC', 1500);
  const { entry: e } = finalizeTimer(t, new Date('2026-10-30T12:00:00Z'));
  assert.equal(e.durationSeconds, 1500);
  assert.equal(e.endAt, '2026-10-30T10:25:00.000Z');
});

test('sesión con varias subactividades no duplica tiempo', () => {
  const e = entry({ activityId: 'gym' });
  const subs: EntrySubactivity[] = [
    { id: 's1', entryId: 'e1', subactivityId: 'pecho' },
    { id: 's2', entryId: 'e1', subactivityId: 'mu', durationSeconds: 900 },
  ];
  assert.equal(subactivitySeconds(e, subs, 'pecho'), 0);
  assert.equal(subactivitySeconds(e, subs, 'mu'), 900);
  const ctx = { subsByEntry: new Map([['e1', subs]]) };
  const all = applyFilter([e], { start: '2026-10-01', end: '2026-10-31' }, ctx);
  assert.equal(all[0].seconds, 3600);
  const bySub = applyFilter([e], { start: '2026-10-01', end: '2026-10-31', subactivityId: 'mu' }, ctx);
  assert.equal(bySub[0].seconds, 900);
});

test('objetivo: un registro cuenta una sola vez aunque coincidan varios vínculos', () => {
  const g: Goal = { id: 'g', name: 'MU', description: '', type: 'frequency', targetValue: 10, startDate: '2026-01-01', status: 'in_progress', archived: false, showTenThousand: false, createdAt: T, updatedAt: T };
  const e = entry({ activityId: 'cal' });
  const subs: EntrySubactivity[] = [
    { id: 's1', entryId: 'e1', subactivityId: 'a', durationSeconds: 600 },
    { id: 's2', entryId: 'e1', subactivityId: 'b', durationSeconds: 600 },
  ];
  const links = [{ id: 'l1', goalId: 'g', subactivityId: 'a' }, { id: 'l2', goalId: 'g', subactivityId: 'b' }, { id: 'l3', goalId: 'g', activityId: 'cal' }];
  const p = goalProgress(g, links, [e], new Map([['e1', subs]]));
  assert.equal(p.count, 1);
  assert.equal(p.seconds, 3600);
  assert.equal(p.ratio, 0.1);
});

test('copia JSON: exporta, valida y rechaza referencias rotas', () => {
  const s = buildSeed();
  const ok = validateBackup(JSON.parse(JSON.stringify(toBackup(s))));
  assert.equal(ok.ok, true);
  const bad = JSON.parse(JSON.stringify(toBackup(s)));
  bad.data.activities[0].categoryId = 'x';
  assert.equal(validateBackup(bad).ok, false);
  assert.equal(validateBackup({ foo: 1 }).ok, false);
});

test('IndexedDB: persiste y aplica operaciones atómicas', async () => {
  const repo = new IndexedDBRepository();
  assert.equal(await repo.loadAll(), null);
  const s = buildSeed();
  await repo.replaceAll(s);
  const ops = [{ type: 'put' as const, store: 'entries' as const, value: entry({ categoryId: s.categories[0].id }) }];
  await repo.apply(ops);
  const loaded = (await repo.loadAll())!;
  assert.equal(loaded.entries.length, 1);
  assert.equal(applyOps(s, ops).entries.length, 1);
  assert.equal(loaded.categories.length, s.categories.length);
});

test('migración v2: quita Desarrollo profesional sin registros y crea App RM, App PV, RM', async () => {
  const { migrationOps } = await import('../data/migrations');
  const s = buildSeed();
  const legacy = { ...s, settings: { ...s.settings, seedVersion: 1 }, categories: [...s.categories, { ...s.categories[0], id: 'old', name: 'Desarrollo profesional' }] };
  legacy.categories = legacy.categories.filter((c) => !['App RM', 'App PV', 'RM'].includes(c.name));
  const out = applyOps(legacy, migrationOps(legacy));
  const names = out.categories.map((c) => c.name);
  assert.ok(!names.includes('Desarrollo profesional'));
  assert.ok(['App RM', 'App PV', 'RM'].every((n) => names.includes(n)));
  assert.equal(migrationOps(out).length, 0);
  const used = { ...legacy, entries: [entry({ categoryId: 'old' })] };
  const out2 = applyOps(used, migrationOps(used));
  assert.equal(out2.categories.find((c) => c.id === 'old')?.archived, true);
});
