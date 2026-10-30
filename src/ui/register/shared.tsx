'use client';

import { sortDayEntries } from '@/domain/entries';
import { formatDuration, formatTime } from '@/domain/format';
import { categoryColor, entryLabel } from '@/domain/hierarchy';
import type { TimeEntry } from '@/domain/types';
import { useStore } from '@/state/store';
import { Dot, Empty, cx } from '../primitives';
import { useUI } from '../ui-context';

/** Ficha compacta: 75 % nombre, 25 % duración. */
export function EntryChip({ entry }: { entry: TimeEntry }) {
  const { lookup, subsByEntry } = useStore();
  const { openDetail } = useUI();
  const color = categoryColor(lookup, entry.categoryId);
  const label = entryLabel(entry, subsByEntry.get(entry.id) ?? [], lookup);
  return (
    <button
      type="button"
      onClick={() => openDetail(entry.id)}
      title={`${label} · ${formatDuration(entry.durationSeconds)}`}
      className="flex h-11 w-full min-w-0 items-center gap-1 rounded-lg px-2 text-left text-[13px] font-medium transition-[filter] hover:brightness-95"
      style={{ background: `color-mix(in srgb, ${color} 20%, rgb(var(--surface)))`, boxShadow: `inset 3px 0 0 ${color}` }}
    >
      <span className="min-w-0 flex-1 truncate pl-1">{label}</span>
      <span className="max-w-[45%] shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted">{formatDuration(entry.durationSeconds)}</span>
    </button>
  );
}

export function CategorySummary({ entries, title, compact }: { entries: TimeEntry[]; title?: string; compact?: boolean }) {
  const { lookup } = useStore();
  const totals = new Map<string, number>();
  for (const e of entries) totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.durationSeconds);
  const rows = [...totals].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, [, s]) => a + s, 0);
  return (
    <div className="flex flex-col gap-2">
      {title && (
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
          <span className="font-mono text-sm font-semibold tabular-nums">{formatDuration(total)}</span>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Sin registros.</p>
      ) : (
        <ul className={cx('flex flex-col', compact ? 'gap-1' : 'gap-2')}>
          {rows.map(([id, s]) => (
            <li key={id} className="flex items-center gap-2 text-sm">
              <Dot color={categoryColor(lookup, id)} />
              <span className="min-w-0 flex-1 truncate">{lookup.category.get(id)?.name ?? '—'}</span>
              <span className="shrink-0 tabular-nums">{formatDuration(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Lista cronológica del día en tarjetas. */
export function DayList({ entries }: { entries: TimeEntry[] }) {
  const { lookup, subsByEntry, snapshot } = useStore();
  const { openDetail } = useUI();
  const use24 = snapshot.settings.use24h;
  if (!entries.length) return <Empty>No hay registros este día.</Empty>;
  return (
    <ul className="flex flex-col gap-2">
      {sortDayEntries(entries).map((e) => {
        const subs = subsByEntry.get(e.id) ?? [];
        const color = categoryColor(lookup, e.categoryId);
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => openDetail(e.id)}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left hover:bg-surface2"
            >
              <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: color }} />
              <span className="w-[5.5rem] shrink-0 text-xs tabular-nums text-muted">
                {e.startAt && e.endAt ? `${formatTime(e.startAt, use24)}–${formatTime(e.endAt, use24)}` : 'Sin horario'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{entryLabel(e, subs, lookup)}</span>
                {subs.length > 1 && (
                  <span className="block truncate text-xs text-muted">{subs.map((s) => lookup.subactivity.get(s.subactivityId)?.name).join(' · ')}</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{formatDuration(e.durationSeconds)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function groupByDate(entries: TimeEntry[]): Map<string, TimeEntry[]> {
  const m = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const l = m.get(e.date);
    if (l) l.push(e);
    else m.set(e.date, [e]);
  }
  return m;
}
