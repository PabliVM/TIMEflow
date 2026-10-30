'use client';

import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatDate, formatDuration, formatPercent } from '@/domain/format';
import { goalProgress, TEN_THOUSAND_HOURS } from '@/domain/goals';
import { bySort, categoryColor } from '@/domain/hierarchy';
import {
  activityKey, applyFilter, bySubactivity, comparePeriods, dailyTotals, daysInRange, seriesByCategory, sleepStats, sumBy, totalSeconds,
} from '@/domain/stats';
import type { Granularity } from '@/domain/stats';
import { addDays, addMonths, diffDays, endOfMonth, rangeKeys, startOfMonth, startOfWeek } from '@/domain/time';
import { useStore } from '@/state/store';
import { Card, Dot, Empty, Field, Input, ProgressBar, Segmented, cx } from '../primitives';
import type { AnalysisData } from './AnalysisView';

const hours = (s: number) => Math.round((s / 3600) * 100) / 100;
const tooltipDuration = (v: unknown) => formatDuration(Number(v) * 3600);

function bucketLabel(b: string, g: Granularity) {
  if (g === 'day' || g === 'week') return formatDate(b, { day: 'numeric', month: 'short' });
  if (g === 'month') return formatDate(`${b}-01`, { month: 'short', year: '2-digit' });
  return b;
}

function Distribution({ data }: { data: AnalysisData }) {
  const { lookup } = useStore();
  const [mode, setMode] = useState<'registered' | 'available'>('registered');
  const rows = sumBy(data.rows, (e) => e.categoryId);
  const registered = totalSeconds(data.rows);
  const available = daysInRange(data.filter.start, data.filter.end) * 86400;
  const base = mode === 'registered' ? registered : available;
  const slices = rows.map((r) => ({ key: r.key, name: lookup.category.get(r.key)?.name ?? '—', value: r.seconds, color: categoryColor(lookup, r.key) }));
  if (mode === 'available' && available > registered)
    slices.push({ key: 'unknown', name: 'Sin registrar (desconocido)', value: available - registered, color: 'rgb(var(--surface-2))' });

  return (
    <Card
      title="Distribución del tiempo"
      action={<Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'registered', label: '% registrado' }, { value: 'available', label: '% del total' }]} />}
    >
      {!rows.length ? (
        <Empty>Sin datos en el periodo.</Empty>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-48 w-48 shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" stroke="rgb(var(--surface))" strokeWidth={2} isAnimationActive={false}>
                  {slices.map((s) => <Cell key={s.key} fill={s.color} />)}
                </Pie>
                <Tooltip formatter={(v) => formatDuration(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex w-full min-w-0 flex-col gap-1.5 text-sm">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <Dot color={s.color} className={s.key === 'unknown' ? 'ring-1 ring-line' : ''} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="tabular-nums text-muted">{formatDuration(s.value)}</span>
                <span className="w-16 text-right font-semibold tabular-nums">{formatPercent(base ? s.value / base : 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        {mode === 'registered' ? 'Porcentaje sobre el tiempo registrado.' : 'Porcentaje sobre las 24 h de cada día del periodo. El tiempo sin registrar es desconocido, no tiempo libre.'}
      </p>
    </Card>
  );
}

function Evolution({ data }: { data: AnalysisData }) {
  const { snapshot, lookup } = useStore();
  const span = diffDays(data.filter.start, data.filter.end);
  const [g, setG] = useState<Granularity>(span > 120 ? 'month' : span > 31 ? 'week' : 'day');
  const series = useMemo(
    () => seriesByCategory(data.rows, data.filter.start, data.filter.end, g, snapshot.settings.weekStartsOn).slice(-120),
    [data.rows, data.filter.start, data.filter.end, g, snapshot.settings.weekStartsOn],
  );
  const cats = snapshot.categories.filter((c) => data.rows.some((r) => r.entry.categoryId === c.id)).sort(bySort);
  const chart = series.map((p) => ({ label: bucketLabel(p.bucket, g), ...Object.fromEntries(cats.map((c) => [c.id, hours((p[c.id] as number) ?? 0)])) }));

  return (
    <Card
      title="Evolución"
      action={<Segmented size="sm" value={g} onChange={setG} options={[{ value: 'day', label: 'Día' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }, { value: 'year', label: 'Año' }]} />}
    >
      {!cats.length ? (
        <Empty>Sin datos en el periodo.</Empty>
      ) : (
        <>
          <div className="h-60 w-full">
            <ResponsiveContainer>
              <BarChart data={chart} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} width={44} unit=" h" allowDecimals={false} />
                <Tooltip formatter={(v, n) => [tooltipDuration(v), lookup.category.get(String(n))?.name ?? n]} cursor={{ fill: 'rgb(var(--surface-2))' }} />
                {cats.map((c, i) => (
                  <Bar key={c.id} dataKey={c.id} stackId="t" fill={c.color} stroke="rgb(var(--surface))" strokeWidth={1} radius={i === cats.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {cats.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5"><Dot color={c.color} />{c.name}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Comparison({ data }: { data: AnalysisData }) {
  const { snapshot, lookup } = useStore();
  const ws = snapshot.settings.weekStartsOn;
  const [kind, setKind] = useState<'week' | 'month' | 'custom'>('week');
  const ref = data.filter.end;
  const def = useMemo(() => {
    if (kind === 'week') {
      const s = startOfWeek(ref, ws);
      return { a: { start: s, end: addDays(s, 6) }, b: { start: addDays(s, -7), end: addDays(s, -1) } };
    }
    const s = startOfMonth(ref);
    const p = addMonths(s, -1);
    return { a: { start: s, end: endOfMonth(s) }, b: { start: p, end: endOfMonth(p) } };
  }, [kind, ref, ws]);
  const [custom, setCustom] = useState(def);
  const ranges = kind === 'custom' ? custom : def;

  const rows = useMemo(() => {
    const a = applyFilter(snapshot.entries, { ...data.filter, ...ranges.a }, data.ctx);
    const b = applyFilter(snapshot.entries, { ...data.filter, ...ranges.b }, data.ctx);
    return { list: comparePeriods(a, b, (e) => e.categoryId), ta: totalSeconds(a), tb: totalSeconds(b) };
  }, [snapshot.entries, data.filter, data.ctx, ranges]);

  const fmtRange = (r: { start: string; end: string }) =>
    `${formatDate(r.start, { day: 'numeric', month: 'short' })} – ${formatDate(r.end, { day: 'numeric', month: 'short' })}`;
  const Diff = ({ d, pct }: { d: number; pct: number | null }) => (
    <span className={cx('whitespace-nowrap tabular-nums', d > 0 ? 'text-accent' : d < 0 ? 'text-danger' : 'text-muted')}>
      {d > 0 ? '+' : d < 0 ? '−' : ''}{formatDuration(Math.abs(d))}
      <span className="ml-1 text-xs text-muted">{pct === null ? 'nuevo' : `${pct > 0 ? '+' : ''}${formatPercent(pct, 0)}`}</span>
    </span>
  );

  return (
    <Card
      title="Comparación de periodos"
      action={<Segmented size="sm" value={kind} onChange={(k) => { setKind(k); if (k === 'custom') setCustom(def); }} options={[{ value: 'week', label: 'Semanas' }, { value: 'month', label: 'Meses' }, { value: 'custom', label: 'Personalizado' }]} />}
    >
      {kind === 'custom' && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(['a', 'b'] as const).map((k) => (
            <div key={k} className="flex flex-col gap-2 rounded-xl bg-surface2 p-2">
              <span className="text-xs font-semibold text-muted">{k === 'a' ? 'Periodo A' : 'Periodo B'}</span>
              <Field label="Desde">{(id) => <Input id={id} type="date" value={custom[k].start} onChange={(e) => e.target.value && setCustom({ ...custom, [k]: { ...custom[k], start: e.target.value } })} />}</Field>
              <Field label="Hasta">{(id) => <Input id={id} type="date" value={custom[k].end} onChange={(e) => e.target.value && setCustom({ ...custom, [k]: { ...custom[k], end: e.target.value } })} />}</Field>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1.5 font-semibold">Categoría</th>
              <th className="py-1.5 text-right font-semibold">A · {fmtRange(ranges.a)}</th>
              <th className="py-1.5 text-right font-semibold">B · {fmtRange(ranges.b)}</th>
              <th className="py-1.5 text-right font-semibold">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {rows.list.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="py-2"><span className="flex items-center gap-2"><Dot color={categoryColor(lookup, r.key)} /><span className="truncate">{lookup.category.get(r.key)?.name}</span></span></td>
                <td className="py-2 text-right tabular-nums">{formatDuration(r.a)}</td>
                <td className="py-2 text-right tabular-nums">{formatDuration(r.b)}</td>
                <td className="py-2 text-right"><Diff d={r.diff} pct={r.pct} /></td>
              </tr>
            ))}
            <tr className="border-t-2 border-line font-semibold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right tabular-nums">{formatDuration(rows.ta)}</td>
              <td className="py-2 text-right tabular-nums">{formatDuration(rows.tb)}</td>
              <td className="py-2 text-right"><Diff d={rows.ta - rows.tb} pct={rows.tb ? (rows.ta - rows.tb) / rows.tb : null} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Heatmap({ data }: { data: AnalysisData }) {
  const { snapshot } = useStore();
  const ws = snapshot.settings.weekStartsOn;
  const totals = dailyTotals(data.rows);
  let start = startOfWeek(data.filter.start, ws);
  const maxStart = startOfWeek(addDays(data.filter.end, -7 * 52), ws);
  if (start < maxStart) start = maxStart;
  const days = rangeKeys(start, data.filter.end);
  const max = Math.max(1, ...totals.values());
  const level = (s: number) => (s <= 0 ? 0 : Math.min(4, Math.ceil((s / max) * 4)));
  const OPACITY = [0, 0.25, 0.45, 0.7, 1];
  const weeks: string[][] = [];
  days.forEach((d, i) => (i % 7 === 0 ? weeks.push([d]) : weeks[weeks.length - 1].push(d)));

  return (
    <Card title="Mapa de actividad">
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max gap-[3px]">
          {weeks.map((w) => (
            <div key={w[0]} className="flex flex-col gap-[3px]">
              {w.map((d) => {
                const s = totals.get(d) ?? 0;
                return (
                  <div
                    key={d}
                    title={`${formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}: ${s ? formatDuration(s) : 'sin registros'}`}
                    className="h-3.5 w-3.5 rounded-[3px] border border-line/60"
                    style={{ background: s ? `rgb(var(--accent) / ${OPACITY[level(s)]})` : 'rgb(var(--surface-2))' }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        Menos {OPACITY.map((o, i) => <span key={i} className="h-3 w-3 rounded-[3px] border border-line/60" style={{ background: o ? `rgb(var(--accent) / ${o})` : 'rgb(var(--surface-2))' }} />)} Más
        <span className="ml-auto">Máx. {formatDuration(max)}/día</span>
      </div>
    </Card>
  );
}

function Ranking({ data }: { data: AnalysisData }) {
  const { lookup, subsByEntry } = useStore();
  const acts = sumBy(data.rows, activityKey).slice(0, 10);
  const subs = bySubactivity(data.rows, subsByEntry).slice(0, 8);
  const max = acts[0]?.seconds ?? 1;
  const nameOf = (k: string) => (k.startsWith('cat:') ? `${lookup.category.get(k.slice(4))?.name ?? '—'} (general)` : (lookup.activity.get(k)?.name ?? '—'));
  const catOf = (k: string) => (k.startsWith('cat:') ? k.slice(4) : (lookup.activity.get(k)?.categoryId ?? ''));
  return (
    <Card title="Ranking de actividades">
      {!acts.length ? (
        <Empty>Sin datos en el periodo.</Empty>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {acts.map((a, i) => (
            <li key={a.key} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="w-5 text-xs tabular-nums text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{nameOf(a.key)}</span>
                <span className="text-xs text-muted">{a.count} ses.</span>
                <span className="w-16 text-right tabular-nums">{formatDuration(a.seconds)}</span>
              </div>
              <div className="ml-7"><ProgressBar ratio={a.seconds / max} color={categoryColor(lookup, catOf(a.key))} /></div>
            </li>
          ))}
        </ol>
      )}
      {subs.length > 0 && (
        <>
          <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Subactividades · frecuencia</h4>
          <ul className="flex flex-col gap-1 text-sm">
            {subs.map((s) => (
              <li key={s.key} className="flex gap-2">
                <span className="min-w-0 flex-1 truncate">{lookup.subactivity.get(s.key)?.name}</span>
                <span className="tabular-nums text-muted">{s.count}×</span>
                <span className="w-20 text-right tabular-nums">{s.seconds ? formatDuration(s.seconds) : '—'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Tiempo solo cuando se conoce el tiempo individual.</p>
        </>
      )}
    </Card>
  );
}

function Sleep({ data }: { data: AnalysisData }) {
  const st = sleepStats(data.rows);
  const days = rangeKeys(data.filter.start, data.filter.end).slice(-120);
  const chart = days.map((d) => ({ label: formatDate(d, { day: 'numeric', month: 'short' }), h: st.perDay.has(d) ? hours(st.perDay.get(d)!) : null }));
  return (
    <Card title="Sueño">
      {!st.nights ? (
        <Empty>Sin registros de sueño en el periodo.</Empty>
      ) : (
        <>
          <dl className="mb-3 grid grid-cols-4 gap-2 text-center">
            {[['Media', st.average], ['Mín.', st.min], ['Máx.', st.max]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl bg-surface2 p-2">
                <dt className="text-xs text-muted">{l}</dt>
                <dd className="font-mono text-sm font-semibold tabular-nums">{formatDuration(v as number)}</dd>
              </div>
            ))}
            <div className="rounded-xl bg-surface2 p-2">
              <dt className="text-xs text-muted">Noches</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums">{st.nights}</dd>
            </div>
          </dl>
          <div className="h-48 w-full">
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} width={44} unit=" h" domain={[0, 'dataMax + 1']} allowDecimals={false} />
                <Tooltip formatter={(v) => [tooltipDuration(v), 'Sueño']} />
                <ReferenceLine y={hours(st.average)} stroke="rgb(var(--muted))" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="h" stroke="rgb(var(--accent))" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: 'rgb(var(--surface))' }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-muted">Línea discontinua: media. Los días sin registro no se rellenan.</p>
        </>
      )}
    </Card>
  );
}

function GoalsProgress() {
  const { snapshot, subsByEntry } = useStore();
  const goals = snapshot.goals.filter((g) => !g.archived && g.type !== 'result');
  return (
    <Card title="Progreso de objetivos">
      {!goals.length ? (
        <Empty>No hay objetivos de tiempo o frecuencia.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((g) => {
            const p = goalProgress(g, snapshot.goalLinks.filter((l) => l.goalId === g.id), snapshot.entries, subsByEntry);
            return (
              <li key={g.id} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                  <span className="tabular-nums text-muted">
                    {g.type === 'time' ? `${formatDuration(p.seconds)} / ${formatDuration(g.targetValue ?? 0)}` : `${p.count} / ${g.targetValue ?? 0}`}
                  </span>
                  <span className="w-14 text-right font-semibold tabular-nums">{formatPercent(p.ratio ?? 0, 0)}</span>
                </div>
                <ProgressBar ratio={p.ratio ?? 0} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function TenThousand({ data }: { data: AnalysisData }) {
  const { snapshot, lookup } = useStore();
  const all = applyFilter(snapshot.entries, data.filter, data.ctx, true);
  const top = sumBy(all, activityKey).filter((a) => !a.key.startsWith('cat:')).slice(0, 5);
  return (
    <Card title="Referencia de 10.000 horas">
      {!top.length ? (
        <Empty>Sin actividades registradas.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {top.map((a) => (
            <li key={a.key} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{lookup.activity.get(a.key)?.name}</span>
                <span className="tabular-nums text-muted">{formatDuration(a.seconds)}</span>
                <span className="w-16 text-right font-semibold tabular-nums">{formatPercent(a.seconds / TEN_THOUSAND_HOURS, 2)}</span>
              </div>
              <ProgressBar ratio={a.seconds / TEN_THOUSAND_HOURS} color={categoryColor(lookup, lookup.activity.get(a.key)?.categoryId ?? '')} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Tiempo acumulado histórico. Es una referencia popular de práctica, no una garantía de alcanzar nivel experto.</p>
    </Card>
  );
}

export function StatsTab({ data }: { data: AnalysisData }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <Distribution data={data} />
      <Evolution data={data} />
      <div className="lg:col-span-2"><Comparison data={data} /></div>
      <Heatmap data={data} />
      <Ranking data={data} />
      <Sleep data={data} />
      <GoalsProgress />
      <div className="lg:col-span-2"><TenThousand data={data} /></div>
    </div>
  );
}
