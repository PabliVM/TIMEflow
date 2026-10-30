'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate, formatDayLong, formatDuration, formatPercent } from '@/domain/format';
import { GOAL_STATUS_LABEL, GOAL_TYPE_LABEL, goalContribution, goalProgress, TEN_THOUSAND_HOURS } from '@/domain/goals';
import type { GoalProgress } from '@/domain/goals';
import { categoryColor, entryLabel } from '@/domain/hierarchy';
import { diffDays, nowIso } from '@/domain/time';
import type { Goal, GoalStatus } from '@/domain/types';
import { useStore } from '@/state/store';
import { useToday } from '../hooks';
import { Button, Card, Empty, ProgressBar, Segmented, Sheet, cx } from '../primitives';
import { useUI } from '../ui-context';
import { GoalForm } from '../goals/GoalForm';

function progressText(g: Goal, p: GoalProgress) {
  if (g.type === 'time') return `${formatDuration(p.seconds)} / ${formatDuration(g.targetValue ?? 0)}`;
  if (g.type === 'frequency') return `${p.count} / ${g.targetValue ?? 0} sesiones`;
  return GOAL_STATUS_LABEL[g.status];
}

const STATUS_CLS: Record<GoalStatus, string> = {
  pending: 'bg-surface2 text-muted',
  in_progress: 'bg-accent/10 text-accent',
  achieved: 'bg-accent text-accentfg',
};

export function StatusPill({ status }: { status: GoalStatus }) {
  return <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_CLS[status])}>{GOAL_STATUS_LABEL[status]}</span>;
}

function GoalDetail({ goal, onClose, onEdit }: { goal: Goal; onClose: () => void; onEdit: () => void }) {
  const { snapshot, subsByEntry, lookup, saveGoal } = useStore();
  const ui = useUI();
  const today = useToday();
  const links = snapshot.goalLinks.filter((l) => l.goalId === goal.id);
  const p = goalProgress(goal, links, snapshot.entries, subsByEntry);
  const cumulative = useMemo(() => {
    let acc = 0;
    return [...p.byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, v]) => {
        acc += goal.type === 'time' ? v.seconds / 3600 : v.count;
        return { label: formatDate(d, { day: 'numeric', month: 'short' }), v: Math.round(acc * 100) / 100 };
      });
  }, [p.byDate, goal.type]);
  const recent = snapshot.entries
    .filter((e) => e.date >= goal.startDate && goalContribution(goal, links, e, subsByEntry.get(e.id) ?? []).matched)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  const daysLeft = goal.targetDate ? diffDays(today, goal.targetDate) : null;

  const setStatus = async (status: GoalStatus) => {
    await saveGoal({ ...goal, status, completedAt: status === 'achieved' ? (goal.completedAt ?? nowIso()) : undefined }, links);
    ui.toast('Estado actualizado');
  };

  return (
    <Sheet open wide onClose={onClose} title={goal.name} footer={<Button icon="edit" variant="primary" className="flex-1" onClick={onEdit}>Editar objetivo</Button>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StatusPill status={goal.status} />
          <span>{GOAL_TYPE_LABEL[goal.type]}</span>
          {goal.categoryId && <span>· {lookup.category.get(goal.categoryId)?.name}</span>}
          <span>· desde {formatDate(goal.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        {goal.description && <p className="text-sm">{goal.description}</p>}

        {goal.type === 'result' ? (
          <Segmented value={goal.status} onChange={setStatus} options={(Object.keys(GOAL_STATUS_LABEL) as GoalStatus[]).map((s) => ({ value: s, label: GOAL_STATUS_LABEL[s] }))} />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-2xl font-semibold tabular-nums">{formatPercent(p.ratio ?? 0, 1)}</span>
              <span className="text-sm text-muted">{progressText(goal, p)}</span>
            </div>
            <ProgressBar ratio={p.ratio ?? 0} />
          </div>
        )}

        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface2 p-2"><dt className="text-xs text-muted">Tiempo conocido</dt><dd className="font-mono text-sm font-semibold">{formatDuration(p.seconds)}</dd></div>
          <div className="rounded-xl bg-surface2 p-2"><dt className="text-xs text-muted">Sesiones</dt><dd className="font-mono text-sm font-semibold">{p.count}</dd></div>
          <div className="rounded-xl bg-surface2 p-2">
            <dt className="text-xs text-muted">Fecha objetivo</dt>
            <dd className="text-sm font-semibold">{goal.targetDate ? (daysLeft! >= 0 ? `${daysLeft} días` : 'vencida') : '—'}</dd>
          </div>
        </dl>

        {cumulative.length > 1 && (
          <Card title="Evolución acumulada">
            <div className="h-44">
              <ResponsiveContainer>
                <AreaChart data={cumulative} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis tickLine={false} axisLine={false} width={44} unit={goal.type === 'time' ? ' h' : ''} />
                  <Tooltip formatter={(v) => [goal.type === 'time' ? formatDuration(Number(v) * 3600) : `${v} sesiones`, 'Acumulado']} />
                  <Area type="monotone" dataKey="v" stroke="rgb(var(--accent))" strokeWidth={2} fill="rgb(var(--accent) / 0.15)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {goal.showTenThousand && (
          <Card title="Referencia de 10.000 horas">
            <div className="mb-1 flex justify-between text-sm">
              <span>{formatDuration(p.allTimeSeconds)} acumuladas</span>
              <span className="font-semibold tabular-nums">{formatPercent(p.allTimeSeconds / TEN_THOUSAND_HOURS, 2)}</span>
            </div>
            <ProgressBar ratio={p.allTimeSeconds / TEN_THOUSAND_HOURS} />
            <p className="mt-2 text-xs text-muted">Comparativa independiente del objetivo personal. No garantiza nivel experto.</p>
          </Card>
        )}

        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Registros recientes</h4>
          {!recent.length ? (
            <Empty>Sin registros vinculados.</Empty>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center gap-2 border-b border-line py-1.5 last:border-0">
                  <span className="h-2 w-2 rounded-full" style={{ background: categoryColor(lookup, e.categoryId) }} />
                  <span className="min-w-0 flex-1 truncate">{entryLabel(e, subsByEntry.get(e.id) ?? [], lookup)}</span>
                  <span className="text-xs text-muted">{formatDayLong(e.date)}</span>
                  <span className="w-16 text-right tabular-nums">{formatDuration(e.durationSeconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}

export function GoalList({ includeArchived = false }: { includeArchived?: boolean }) {
  const { snapshot, subsByEntry, lookup } = useStore();
  const [detail, setDetail] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null | undefined>(undefined);
  const goals = snapshot.goals.filter((g) => includeArchived || !g.archived).sort((a, b) => Number(a.archived) - Number(b.archived) || a.createdAt.localeCompare(b.createdAt));
  const detailGoal = detail ? snapshot.goals.find((g) => g.id === detail) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button icon="plus" variant="primary" onClick={() => setEdit(null)}>Nuevo objetivo</Button>
      </div>
      {!goals.length ? (
        <Empty>Crea tu primer objetivo: tiempo (100 h de inglés), frecuencia (50 sesiones) o resultado (un muscle-up).</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const p = goalProgress(g, snapshot.goalLinks.filter((l) => l.goalId === g.id), snapshot.entries, subsByEntry);
            return (
              <button key={g.id} type="button" onClick={() => setDetail(g.id)} className={cx('flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-left hover:border-accent/50', g.archived && 'opacity-60')}>
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold">{g.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      {g.categoryId && <span className="h-2 w-2 rounded-full" style={{ background: categoryColor(lookup, g.categoryId) }} />}
                      {g.categoryId ? lookup.category.get(g.categoryId)?.name : GOAL_TYPE_LABEL[g.type]}
                      {g.targetDate && ` · hasta ${formatDate(g.targetDate, { day: 'numeric', month: 'short' })}`}
                      {g.archived && ' · archivado'}
                    </span>
                  </span>
                  <StatusPill status={g.status} />
                </div>
                {g.type !== 'result' && <ProgressBar ratio={p.ratio ?? 0} />}
                <div className="flex justify-between text-sm">
                  <span className="tabular-nums text-muted">{progressText(g, p)}</span>
                  <span className="tabular-nums text-muted">{formatDuration(p.seconds)} · {p.count} ses.</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {detailGoal && <GoalDetail goal={detailGoal} onClose={() => setDetail(null)} onEdit={() => { setDetail(null); setEdit(detailGoal.id); }} />}
      {edit !== undefined && <GoalForm goalId={edit ?? undefined} onClose={() => setEdit(undefined)} />}
    </div>
  );
}

export function GoalsTab() {
  return <GoalList />;
}
