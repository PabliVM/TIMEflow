'use client';

import { useMemo, useState } from 'react';
import { formatDuration, formatPercent } from '@/domain/format';
import { bySort, categoryColor } from '@/domain/hierarchy';
import { applyFilter, PERIOD_LABEL, periodRange, sleepStats, sumBy, totalSeconds } from '@/domain/stats';
import type { Filter, PeriodPreset, StatsContext, Weighted } from '@/domain/stats';
import { METHOD_LABEL } from '@/domain/types';
import type { EntryMethod } from '@/domain/types';
import { useStore } from '@/state/store';
import { useToday } from '../hooks';
import { Icon } from '../icons';
import { Button, Field, Input, Segmented, Select, cx } from '../primitives';
import { DatabaseTab } from './DatabaseTab';
import { GoalsTab } from './GoalsTab';
import { StatsTab } from './StatsTab';

type Tab = 'summary' | 'stats' | 'goals' | 'db';

export interface AnalysisData {
  filter: Filter;
  rows: Weighted[];
  ctx: StatsContext;
}

function Filters({ preset, setPreset, filter, setFilter, onReset }: {
  preset: PeriodPreset; setPreset: (p: PeriodPreset) => void; filter: Filter; setFilter: (f: Filter) => void; onReset: () => void;
}) {
  const { snapshot } = useStore();
  const [open, setOpen] = useState(false);
  const cats = snapshot.categories.slice().sort(bySort);
  const acts = snapshot.activities.filter((a) => !filter.categoryId || a.categoryId === filter.categoryId).sort(bySort);
  const subs = snapshot.subactivities.filter((s) => s.activityId === filter.activityId).sort(bySort);
  const active = [filter.categoryId, filter.activityId, filter.subactivityId, filter.goalId, filter.method].filter(Boolean).length;

  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Periodo" className="min-w-[10rem] flex-1">
          {(id) => (
            <Select id={id} value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)}>
              {(Object.keys(PERIOD_LABEL) as PeriodPreset[]).map((p) => (
                <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Button icon="filter" onClick={() => setOpen(!open)} aria-expanded={open} className="lg:hidden">
          Filtros{active ? ` (${active})` : ''}
        </Button>
        <Button variant="ghost" onClick={onReset} disabled={!active && preset === 'month'}>Restablecer</Button>
      </div>
      <div className={cx('mt-3 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid lg:grid-cols-7', open ? 'grid' : 'hidden')}>
        <Field label="Desde">{(id) => <Input id={id} type="date" value={filter.start} max={filter.end} onChange={(e) => { if (e.target.value) { setPreset('custom'); setFilter({ ...filter, start: e.target.value }); } }} />}</Field>
        <Field label="Hasta">{(id) => <Input id={id} type="date" value={filter.end} min={filter.start} onChange={(e) => { if (e.target.value) { setPreset('custom'); setFilter({ ...filter, end: e.target.value }); } }} />}</Field>
        <Field label="Categoría">
          {(id) => (
            <Select id={id} value={filter.categoryId ?? ''} onChange={(e) => setFilter({ ...filter, categoryId: e.target.value || undefined, activityId: undefined, subactivityId: undefined })}>
              <option value="">Todas</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archivada)' : ''}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Actividad">
          {(id) => (
            <Select id={id} value={filter.activityId ?? ''} onChange={(e) => setFilter({ ...filter, activityId: e.target.value || undefined, subactivityId: undefined })}>
              <option value="">Todas</option>
              {acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Subactividad">
          {(id) => (
            <Select id={id} value={filter.subactivityId ?? ''} disabled={!filter.activityId} onChange={(e) => setFilter({ ...filter, subactivityId: e.target.value || undefined })}>
              <option value="">Todas</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Objetivo">
          {(id) => (
            <Select id={id} value={filter.goalId ?? ''} onChange={(e) => setFilter({ ...filter, goalId: e.target.value || undefined })}>
              <option value="">Todos</option>
              {snapshot.goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Método">
          {(id) => (
            <Select id={id} value={filter.method ?? ''} onChange={(e) => setFilter({ ...filter, method: (e.target.value || undefined) as EntryMethod | undefined })}>
              <option value="">Todos</option>
              {(Object.keys(METHOD_LABEL) as EntryMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </Select>
          )}
        </Field>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
      <span className="flex items-center gap-2 truncate text-xs font-semibold uppercase tracking-wide text-muted">
        {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

function SummaryTab({ data }: { data: AnalysisData }) {
  const { snapshot, lookup } = useStore();
  const total = totalSeconds(data.rows);
  const sleep = sleepStats(data.rows);
  const byCat = sumBy(data.rows, (e) => e.categoryId);
  const goalsActive = snapshot.goals.filter((g) => !g.archived && g.status !== 'achieved').length;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi label="Tiempo registrado" value={formatDuration(total)} sub={`${data.rows.length} registros`} />
      <Kpi label="Sueño medio" value={sleep.nights ? formatDuration(sleep.average) : '—'} sub={sleep.nights ? `${sleep.nights} noches registradas` : 'Sin registros de sueño'} />
      <Kpi label="Sesiones" value={String(data.rows.length)} sub={`${new Set(data.rows.map((r) => r.entry.date)).size} días con registros`} />
      <Kpi label="Objetivos activos" value={String(goalsActive)} />
      {byCat.map((c) => (
        <Kpi
          key={c.key}
          label={lookup.category.get(c.key)?.name ?? '—'}
          color={categoryColor(lookup, c.key)}
          value={formatDuration(c.seconds)}
          sub={`${formatPercent(total ? c.seconds / total : 0)} del registrado · ${c.count} ses.`}
        />
      ))}
    </div>
  );
}

export function AnalysisView() {
  const { snapshot, subsByEntry } = useStore();
  const today = useToday();
  const ws = snapshot.settings.weekStartsOn;
  const earliest = useMemo(() => snapshot.entries.reduce<string | undefined>((m, e) => (!m || e.date < m ? e.date : m), undefined), [snapshot.entries]);
  const [tab, setTab] = useState<Tab>('summary');
  const [preset, setPresetState] = useState<PeriodPreset>('month');
  const [filter, setFilter] = useState<Filter>(() => periodRange('month', today, ws));

  const setPreset = (p: PeriodPreset) => {
    setPresetState(p);
    if (p !== 'custom') setFilter((f) => ({ ...f, ...periodRange(p, today, ws, earliest) }));
  };

  const ctx = useMemo<StatsContext>(() => {
    const goal = filter.goalId ? snapshot.goals.find((g) => g.id === filter.goalId) : undefined;
    return { subsByEntry, goal, goalLinks: goal ? snapshot.goalLinks.filter((l) => l.goalId === goal.id) : [] };
  }, [filter.goalId, snapshot.goals, snapshot.goalLinks, subsByEntry]);

  const rows = useMemo(() => applyFilter(snapshot.entries, filter, ctx), [snapshot.entries, filter, ctx]);
  const data: AnalysisData = { filter, rows, ctx };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Análisis</h1>
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'summary', label: 'Resumen' },
            { value: 'stats', label: 'Estadísticas' },
            { value: 'goals', label: 'Objetivos' },
            { value: 'db', label: 'Base de datos' },
          ]}
          className="min-w-[26rem] md:max-w-xl"
        />
      </div>
      {tab !== 'goals' && (
        <Filters
          preset={preset}
          setPreset={setPreset}
          filter={filter}
          setFilter={setFilter}
          onReset={() => {
            setPresetState('month');
            setFilter(periodRange('month', today, ws));
          }}
        />
      )}
      {tab === 'summary' && <SummaryTab data={data} />}
      {tab === 'stats' && <StatsTab data={data} />}
      {tab === 'goals' && <GoalsTab />}
      {tab === 'db' && <DatabaseTab data={data} />}
      {tab !== 'goals' && snapshot.entries.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Icon name="calendar" size={16} /> Aún no hay registros. Empieza desde Registro con el botón +.
        </p>
      )}
    </div>
  );
}
