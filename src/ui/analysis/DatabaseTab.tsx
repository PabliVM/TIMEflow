'use client';

import { Fragment, useMemo, useState } from 'react';
import { entriesToCsv } from '@/domain/backup';
import { formatDate, formatDuration, formatTime } from '@/domain/format';
import { categoryColor, entryLabel } from '@/domain/hierarchy';
import { totalSeconds } from '@/domain/stats';
import { METHOD_LABEL } from '@/domain/types';
import { useStore } from '@/state/store';
import { useEntryActions } from '../entry/EntryDetail';
import { downloadFile } from '../hooks';
import { Icon } from '../icons';
import { Button, Empty, IconButton, Input, Select } from '../primitives';
import { useUI } from '../ui-context';
import type { AnalysisData } from './AnalysisView';

type Sort = 'date-desc' | 'date-asc' | 'dur-desc' | 'dur-asc';
const PAGE = 100;

export function DatabaseTab({ data }: { data: AnalysisData }) {
  const store = useStore();
  const { snapshot, lookup, subsByEntry } = store;
  const ui = useUI();
  const actions = useEntryActions();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('date-desc');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const use24 = snapshot.settings.use24h;
  const goals = useMemo(() => new Map(snapshot.goals.map((g) => [g.id, g.name])), [snapshot.goals]);

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('es');
    const list = data.rows.filter(({ entry: e }) => {
      if (!needle) return true;
      const subs = (subsByEntry.get(e.id) ?? []).map((s) => lookup.subactivity.get(s.subactivityId)?.name ?? '');
      return [lookup.category.get(e.categoryId)?.name, e.activityId && lookup.activity.get(e.activityId)?.name, ...subs, e.notes, e.goalId && goals.get(e.goalId)]
        .some((t) => t && t.toLocaleLowerCase('es').includes(needle));
    });
    const key = (e: (typeof list)[number]['entry']) => `${e.date}${e.startAt ?? 'z'}${e.createdAt}`;
    return list.sort((a, b) => {
      if (sort === 'dur-desc') return b.seconds - a.seconds;
      if (sort === 'dur-asc') return a.seconds - b.seconds;
      return sort === 'date-asc' ? key(a.entry).localeCompare(key(b.entry)) : key(b.entry).localeCompare(key(a.entry));
    });
  }, [data.rows, q, sort, subsByEntry, lookup, goals]);

  const exportCsv = () => {
    downloadFile(`timeflow-registros-${data.filter.start}_${data.filter.end}.csv`, entriesToCsv(snapshot, rows.map((r) => r.entry)), 'text/csv;charset=utf-8');
    ui.toast('CSV exportado');
  };

  const subNames = (id: string) => subsByEntry.get(id) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Buscar</span>
          <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar actividad, nota, objetivo…" className="pl-9" />
        </label>
        <Select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto">
          <option value="date-desc">Más recientes</option>
          <option value="date-asc">Más antiguos</option>
          <option value="dur-desc">Mayor duración</option>
          <option value="dur-asc">Menor duración</option>
        </Select>
        <Button icon="download" onClick={exportCsv} disabled={!rows.length}>CSV</Button>
        <Button icon="plus" variant="primary" onClick={() => ui.openEntryForm({})}>Añadir</Button>
      </div>
      <p className="text-sm text-muted">
        {rows.length} registros · <strong className="text-fg">{formatDuration(totalSeconds(rows))}</strong>
        {data.filter.subactivityId || data.filter.goalId ? ' (tiempo atribuido)' : ''}
      </p>

      {!rows.length ? (
        <Empty>No hay registros con estos filtros.</Empty>
      ) : (
        <>
          {/* Móvil: tarjetas */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {rows.slice(0, limit).map(({ entry: e, seconds }) => {
              const subs = subNames(e.id);
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => ui.openDetail(e.id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left">
                    <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: categoryColor(lookup, e.categoryId) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{entryLabel(e, subs, lookup)}</span>
                      <span className="block truncate text-xs text-muted">
                        {formatDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                        {e.startAt && ` · ${formatTime(e.startAt, use24)}`} · {METHOD_LABEL[e.method]}
                        {subs.length > 1 && ` · ${subs.length} subactividades`}
                      </span>
                    </span>
                    <span className="font-mono text-sm font-semibold tabular-nums">{formatDuration(seconds)}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Escritorio: tabla */}
          <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface lg:block">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  {['Fecha', 'Categoría', 'Actividad', 'Subactividad', 'Inicio', 'Fin', 'Duración', 'Método', 'Objetivo', 'Notas', ''].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map(({ entry: e, seconds }) => {
                  const subs = subNames(e.id);
                  const expandable = subs.length > 1;
                  return (
                    <Fragment key={e.id}>
                      <tr className="border-t border-line hover:bg-surface2/60">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{e.date}</td>
                        <td className="px-3 py-2"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: categoryColor(lookup, e.categoryId) }} />{lookup.category.get(e.categoryId)?.name}</span></td>
                        <td className="px-3 py-2">{e.activityId ? lookup.activity.get(e.activityId)?.name : '—'}</td>
                        <td className="px-3 py-2">
                          {expandable ? (
                            <button type="button" className="inline-flex items-center gap-1 text-accent" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                              {subs.length} subactividades <Icon name={open === e.id ? 'up' : 'down'} size={14} />
                            </button>
                          ) : subs.length === 1 ? lookup.subactivity.get(subs[0].subactivityId)?.name : '—'}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{e.startAt ? formatTime(e.startAt, use24) : '—'}</td>
                        <td className="px-3 py-2 tabular-nums">{e.endAt ? formatTime(e.endAt, use24) : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold tabular-nums">{formatDuration(seconds)}</td>
                        <td className="px-3 py-2">{METHOD_LABEL[e.method]}</td>
                        <td className="max-w-[10rem] truncate px-3 py-2">{e.goalId ? goals.get(e.goalId) : '—'}</td>
                        <td className="max-w-[14rem] truncate px-3 py-2 text-muted" title={e.notes}>{e.notes || '—'}</td>
                        <td className="whitespace-nowrap px-1 py-1">
                          <IconButton icon="edit" label="Editar" size={16} onClick={() => actions.edit(e.id)} />
                          <IconButton icon="copy" label="Duplicar" size={16} onClick={() => actions.duplicate(e.id)} />
                          <IconButton icon="trash" label="Eliminar" size={16} className="text-danger" onClick={() => actions.remove(e.id)} />
                        </td>
                      </tr>
                      {expandable && open === e.id && subs.map((s) => (
                        <tr key={s.id} className="bg-surface2/40 text-muted">
                          <td colSpan={3} />
                          <td className="px-3 py-1.5">↳ {lookup.subactivity.get(s.subactivityId)?.name}</td>
                          <td colSpan={2} />
                          <td className="px-3 py-1.5 tabular-nums">{s.durationSeconds != null ? formatDuration(s.durationSeconds) : 'incluida'}</td>
                          <td colSpan={4} />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > limit && <Button onClick={() => setLimit(limit + PAGE)}>Mostrar más ({rows.length - limit})</Button>}
        </>
      )}
    </div>
  );
}
