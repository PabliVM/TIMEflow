'use client';

import { formatDayLong, formatDuration, formatWeekday } from '@/domain/format';
import { categoryColor } from '@/domain/hierarchy';
import { addDays, diffDays, endOfMonth, parseDateKey, startOfMonth, startOfWeek } from '@/domain/time';
import type { ISODate, TimeEntry } from '@/domain/types';
import { sortDayEntries } from '@/domain/entries';
import { useStore } from '@/state/store';
import { Button, cx } from '../primitives';
import { useUI } from '../ui-context';
import { CategorySummary, DayList } from './shared';

const MAX_DOTS = 4;

export function MonthView({
  cursor, selected, onSelect, byDate, today,
}: { cursor: ISODate; selected: ISODate; onSelect: (d: ISODate) => void; byDate: Map<string, TimeEntry[]>; today: ISODate }) {
  const { snapshot, lookup } = useStore();
  const { openEntryForm } = useUI();
  const ws = snapshot.settings.weekStartsOn;
  const first = startOfWeek(startOfMonth(cursor), ws);
  const last = endOfMonth(cursor);
  const weeks = Math.ceil((diffDays(first, last) + 1) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i));
  const month = cursor.slice(0, 7);
  const dayEntries = byDate.get(selected) ?? [];

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="rounded-2xl border border-line bg-surface p-2">
        <div className="grid grid-cols-7 gap-1 pb-1">
          {days.slice(0, 7).map((d) => (
            <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
              {formatWeekday(d).slice(0, 2)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const list = sortDayEntries(byDate.get(d) ?? []);
            const inMonth = d.slice(0, 7) === month;
            const total = list.reduce((a, e) => a + e.durationSeconds, 0);
            return (
              <button
                key={d}
                type="button"
                onClick={() => onSelect(d)}
                aria-pressed={d === selected}
                className={cx(
                  'flex h-14 min-w-0 flex-col items-center gap-1 overflow-hidden rounded-lg p-1 sm:h-20 lg:h-24 lg:items-start lg:p-2',
                  d === selected ? 'bg-accent/10 ring-2 ring-accent' : 'hover:bg-surface2',
                  !inMonth && 'opacity-40',
                )}
              >
                <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums', d === today && 'bg-accent text-accentfg')}>
                  {parseDateKey(d).getDate()}
                </span>
                <span className="flex flex-wrap items-center justify-center gap-0.5 lg:justify-start">
                  {list.slice(0, MAX_DOTS).map((e) => (
                    <span key={e.id} className="h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2" style={{ background: categoryColor(lookup, e.categoryId) }} />
                  ))}
                  {list.length > MAX_DOTS && <span className="text-[10px] leading-none text-muted">+{list.length - MAX_DOTS}</span>}
                </span>
                {total > 0 && <span className="hidden text-[11px] tabular-nums text-muted sm:block">{formatDuration(total)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <section className="flex flex-col gap-3 lg:sticky lg:top-4">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 font-display text-base font-semibold first-letter:uppercase">{formatDayLong(selected)}</h2>
          <Button icon="plus" variant="primary" onClick={() => openEntryForm({ date: selected })}>
            Registrar
          </Button>
        </div>
        <DayList entries={dayEntries} />
        {dayEntries.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <CategorySummary entries={dayEntries} title="Resumen del día" />
          </div>
        )}
      </section>
    </div>
  );
}
