'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { applyOps, createRepository } from '@/data';
import { migrationOps } from '@/data/migrations';
import type { Op, Repository } from '@/data';
import { groupSubsByEntry } from '@/domain/entries';
import { buildLookup, bySort, isDuplicateName, nextSortOrder, normalizeName } from '@/domain/hierarchy';
import type { Lookup } from '@/domain/hierarchy';
import { uuid } from '@/domain/ids';
import { buildSeed } from '@/domain/seed';
import { localTimeZone, nowIso } from '@/domain/time';
import { createTimer, finalizeTimer, isPomodoroComplete, pauseTimer, resumeTimer } from '@/domain/timer';
import type {
  Activity, Category, EntryDraft, EntrySubactivity, Goal, GoalLink, Settings, Snapshot, Subactivity, TimeEntry, TimerMode,
} from '@/domain/types';

export type NodeKind = 'category' | 'activity' | 'subactivity';
const NODE_STORE = { category: 'categories', activity: 'activities', subactivity: 'subactivities' } as const;

export type SubInput = { subactivityId: string; durationSeconds?: number };

interface StoreValue {
  snapshot: Snapshot;
  lookup: Lookup;
  subsByEntry: Map<string, EntrySubactivity[]>;
  persistent: boolean;
  saveEntry(entry: TimeEntry, subs: SubInput[]): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  duplicateEntry(id: string): Promise<void>;
  createNode(kind: NodeKind, parentId: string | null, name: string, color?: string): Promise<string>;
  updateNode(kind: NodeKind, id: string, patch: { name?: string; color?: string; archived?: boolean }): Promise<void>;
  moveNode(kind: NodeKind, id: string, dir: -1 | 1): Promise<void>;
  saveGoal(goal: Goal, links: Omit<GoalLink, 'id' | 'goalId'>[]): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  startTimer(draft: EntryDraft, mode: TimerMode, plannedSeconds?: number): Promise<void>;
  pauseTimer(): Promise<void>;
  resumeTimer(): Promise<void>;
  finishTimer(): Promise<TimeEntry | null>;
  discardTimer(): Promise<void>;
  replaceAll(s: Snapshot): Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider ausente');
  return v;
}

export class UserError extends Error {}

function siblingsOf(s: Snapshot, kind: NodeKind, parentId: string | null): (Category | Activity | Subactivity)[] {
  if (kind === 'category') return s.categories;
  if (kind === 'activity') return s.activities.filter((a) => a.categoryId === parentId);
  return s.subactivities.filter((x) => x.activityId === parentId);
}

function parentOf(s: Snapshot, kind: NodeKind, id: string): string | null {
  if (kind === 'activity') return s.activities.find((a) => a.id === id)?.categoryId ?? null;
  if (kind === 'subactivity') return s.subactivities.find((a) => a.id === id)?.activityId ?? null;
  return null;
}

export function StoreProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const ref = useRef<Snapshot | null>(null);
  ref.current = snapshot;
  const channel = useRef<BroadcastChannel | null>(null);
  const finishing = useRef(false);

  const reload = useCallback(async (r: Repository) => {
    let s = await r.loadAll();
    if (!s) {
      s = buildSeed();
      await r.replaceAll(s);
    }
    const ops = migrationOps(s);
    if (ops.length) {
      await r.apply(ops);
      s = applyOps(s, ops);
    }
    setSnapshot(s);
  }, []);

  useEffect(() => {
    let alive = true;
    createRepository().then(async (r) => {
      if (!alive) return;
      setRepo(r);
      await reload(r);
      r.subscribe?.(() => reload(r));
      if (typeof BroadcastChannel !== 'undefined') {
        channel.current = new BroadcastChannel('timeflow');
        channel.current.onmessage = () => reload(r);
      }
    });
    return () => {
      alive = false;
      channel.current?.close();
    };
  }, [reload]);

  const commit = useCallback(
    async (ops: Op[]) => {
      if (!repo || !ops.length) return;
      await repo.apply(ops);
      setSnapshot((s) => (s ? applyOps(s, ops) : s));
      ref.current = ref.current ? applyOps(ref.current, ops) : ref.current;
      channel.current?.postMessage('changed');
    },
    [repo],
  );

  const current = () => {
    if (!ref.current) throw new Error('Datos no cargados');
    return ref.current;
  };

  const actions = useMemo(() => {
    const subOps = (s: Snapshot, entryId: string, subs: SubInput[]): Op[] => {
      const existing = s.entrySubactivities.filter((l) => l.entryId === entryId);
      const keep = new Set(subs.map((x) => x.subactivityId));
      const ops: Op[] = existing
        .filter((l) => !keep.has(l.subactivityId))
        .map((l) => ({ type: 'delete', store: 'entrySubactivities', key: l.id }));
      for (const x of subs) {
        const prev = existing.find((l) => l.subactivityId === x.subactivityId);
        ops.push({
          type: 'put',
          store: 'entrySubactivities',
          value: { id: prev?.id ?? uuid(), entryId, subactivityId: x.subactivityId, durationSeconds: x.durationSeconds },
        });
      }
      return ops;
    };

    const finishTimer = async () => {
      const s = current();
      if (!s.timer) return null;
      const { entry, subs } = finalizeTimer(s.timer, new Date());
      await commit([
        { type: 'put', store: 'entries', value: entry },
        ...subs.map((value): Op => ({ type: 'put', store: 'entrySubactivities', value })),
        { type: 'delete', store: 'timer', key: s.timer.entryId },
      ]);
      return entry;
    };

    return {
      async saveEntry(entry: TimeEntry, subs: SubInput[]) {
        const s = current();
        await commit([{ type: 'put', store: 'entries', value: { ...entry, updatedAt: nowIso() } }, ...subOps(s, entry.id, subs)]);
      },
      async deleteEntry(id: string) {
        const s = current();
        await commit([
          { type: 'delete', store: 'entries', key: id },
          ...s.entrySubactivities
            .filter((l) => l.entryId === id)
            .map((l): Op => ({ type: 'delete', store: 'entrySubactivities', key: l.id })),
        ]);
      },
      async duplicateEntry(id: string) {
        const s = current();
        const e = s.entries.find((x) => x.id === id);
        if (!e) return;
        const t = nowIso();
        const copy: TimeEntry = { ...e, id: uuid(), createdAt: t, updatedAt: t };
        const subs = s.entrySubactivities.filter((l) => l.entryId === id);
        await commit([
          { type: 'put', store: 'entries', value: copy },
          ...subs.map((l): Op => ({ type: 'put', store: 'entrySubactivities', value: { ...l, id: uuid(), entryId: copy.id } })),
        ]);
      },
      async createNode(kind: NodeKind, parentId: string | null, name: string, color?: string) {
        const s = current();
        const clean = normalizeName(name);
        if (!clean) throw new UserError('Escribe un nombre.');
        const siblings = siblingsOf(s, kind, parentId);
        if (isDuplicateName(siblings, clean)) throw new UserError(`Ya existe "${clean}" en este nivel.`);
        const t = nowIso();
        const base = { id: uuid(), name: clean, sortOrder: nextSortOrder(siblings), archived: false, createdAt: t, updatedAt: t };
        const op: Op =
          kind === 'category'
            ? { type: 'put', store: 'categories', value: { ...base, color: color ?? '#7C8798' } }
            : kind === 'activity'
              ? { type: 'put', store: 'activities', value: { ...base, categoryId: parentId! } }
              : { type: 'put', store: 'subactivities', value: { ...base, activityId: parentId! } };
        await commit([op]);
        return base.id;
      },
      async updateNode(kind: NodeKind, id: string, patch: { name?: string; color?: string; archived?: boolean }) {
        const s = current();
        const store = NODE_STORE[kind];
        const item = (s[store] as (Category | Activity | Subactivity)[]).find((x) => x.id === id);
        if (!item) return;
        const next = { ...item, ...patch, updatedAt: nowIso() };
        if (patch.name !== undefined) {
          next.name = normalizeName(patch.name);
          if (!next.name) throw new UserError('Escribe un nombre.');
          if (isDuplicateName(siblingsOf(s, kind, parentOf(s, kind, id)), next.name, id))
            throw new UserError(`Ya existe "${next.name}" en este nivel.`);
        }
        await commit([{ type: 'put', store, value: next } as Op]);
      },
      async moveNode(kind: NodeKind, id: string, dir: -1 | 1) {
        const s = current();
        const store = NODE_STORE[kind];
        const list = [...siblingsOf(s, kind, parentOf(s, kind, id))].sort(bySort);
        const i = list.findIndex((x) => x.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        const t = nowIso();
        await commit(
          list
            .map((x, idx) => ({ x, idx }))
            .filter(({ x, idx }) => x.sortOrder !== idx)
            .map(({ x, idx }) => ({ type: 'put', store, value: { ...x, sortOrder: idx, updatedAt: t } }) as Op),
        );
      },
      async saveGoal(goal: Goal, links: Omit<GoalLink, 'id' | 'goalId'>[]) {
        const s = current();
        const name = normalizeName(goal.name);
        if (!name) throw new UserError('El objetivo necesita un nombre.');
        const old = s.goalLinks.filter((l) => l.goalId === goal.id);
        await commit([
          { type: 'put', store: 'goals', value: { ...goal, name, updatedAt: nowIso() } },
          ...old.map((l): Op => ({ type: 'delete', store: 'goalLinks', key: l.id })),
          ...links.map((l): Op => ({ type: 'put', store: 'goalLinks', value: { ...l, id: uuid(), goalId: goal.id } })),
        ]);
      },
      async updateSettings(patch: Partial<Settings>) {
        await commit([{ type: 'put', store: 'settings', value: { ...current().settings, ...patch, id: 'settings' } }]);
      },
      async startTimer(draft: EntryDraft, mode: TimerMode, plannedSeconds?: number) {
        const s = current();
        if (s.timer) throw new UserError('Ya hay un temporizador activo. Finalízalo antes de iniciar otro.');
        if (!draft.categoryId) throw new UserError('Elige una categoría.');
        await commit([{ type: 'put', store: 'timer', value: createTimer(draft, mode, new Date(), localTimeZone(), plannedSeconds) }]);
      },
      async pauseTimer() {
        const t = current().timer;
        if (t) await commit([{ type: 'put', store: 'timer', value: pauseTimer(t, new Date()) }]);
      },
      async resumeTimer() {
        const t = current().timer;
        if (t) await commit([{ type: 'put', store: 'timer', value: resumeTimer(t, new Date()) }]);
      },
      finishTimer,
      async discardTimer() {
        const t = current().timer;
        if (t) await commit([{ type: 'delete', store: 'timer', key: t.entryId }]);
      },
      async replaceAll(next: Snapshot) {
        if (!repo) return;
        await repo.replaceAll(next);
        ref.current = next;
        setSnapshot(next);
        channel.current?.postMessage('changed');
      },
    };
  }, [commit, repo]);

  // Pomodoro: se cierra solo al cumplirse (también tras reabrir la app).
  const timer = snapshot?.timer;
  useEffect(() => {
    if (!timer || timer.mode !== 'pomodoro' || timer.status !== 'running') return;
    const check = () => {
      if (finishing.current || !isPomodoroComplete(timer, new Date())) return;
      finishing.current = true;
      actions.finishTimer().finally(() => (finishing.current = false));
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [timer, actions]);

  const theme = snapshot?.settings.theme;
  useEffect(() => {
    const root = document.documentElement;
    if (!theme || theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  const bg = snapshot?.settings.background;
  const background = bg === 'stars' || bg === 'plain' ? bg : 'forest';
  useEffect(() => {
    document.documentElement.setAttribute('data-bg', background);
  }, [background]);

  const derived = useMemo(
    () => (snapshot ? { lookup: buildLookup(snapshot), subsByEntry: groupSubsByEntry(snapshot.entrySubactivities) } : null),
    [snapshot],
  );

  if (!snapshot || !derived || !repo) return <>{fallback}</>;
  return (
    <Ctx.Provider value={{ snapshot, ...derived, persistent: repo.kind !== 'memory', ...actions }}>{children}</Ctx.Provider>
  );
}
