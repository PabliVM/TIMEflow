'use client';

import { useEffect, useRef } from 'react';
import { sortDayEntries } from '@/domain/entries';
import { formatDuration, formatWeekday } from '@/domain/format';
import { addDays, parseDateKey } from '@/domain/time';
import type { ISODate, TimeEntry } from '@/domain/types';
import { Icon } from '../icons';
import { cx } from '../primitives';
import { useUI } from '../ui-context';
import { CategorySummary, EntryChip } from './shared';

export function WeekView({ weekStart, byDate, today, onOpenDay }: { weekStart: ISODate; byDate: Map<string, TimeEntry[]>; today: ISODate; onOpenDay: (d: ISODate) => void }) {
  const { openEntryForm } = useUI();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEntries = days.flatMap((d) => byDate.get(d) ?? []);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>('[data-today="true"]');
    if (el && scroller.current && scroller.current.scrollWidth > scroller.current.clientWidth) {
      scroller.current.scrollTo({ left: el.offsetLeft - 8 });
    }
  }, [weekStart]);

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-4">
      <details className="group rounded-2xl border border-line bg-surface lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold">
          <span className="flex-1">Resumen semanal</span>
          <span className="font-mono tabular-nums">{formatDuration(weekEntries.reduce((a, e) => a + e.durationSeconds, 0))}</span>
          <Icon name="down" size={18} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line px-4 py-3">
          <CategorySummary entries={weekEntries} compact />
        </div>
      </details>
      <aside className="hidden rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-4 lg:block">
        <CategorySummary entries={weekEntries} title="Resumen semanal" />
      </aside>

      <div ref={scroller} className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:overflow-visible lg:px-0">
        <div className="grid w-max grid-cols-[repeat(7,9.25rem)] gap-2 lg:w-full lg:grid-cols-7">
          {days.map((d) => {
            const list = sortDayEntries(byDate.get(d) ?? []);
            const total = list.reduce((a, e) => a + e.durationSeconds, 0);
            const isToday = d === today;
            return (
              <section key={d} data-today={isToday} className={cx('flex min-w-0 flex-col gap-1.5 rounded-2xl border p-1.5', isToday ? 'border-accent/60 bg-accent/5' : 'border-line bg-surface')}>
                <button type="button" onClick={() => onOpenDay(d)} className="flex min-h-11 items-center gap-2 rounded-lg px-1.5 text-left hover:bg-surface2">
                  <span className={cx('flex h-8 w-8 items-center justify-center rounded-full font-display text-sm font-semibold', isToday && 'bg-accent text-accentfg')}>
                    {parseDateKey(d).getDate()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{formatWeekday(d)}</span>
                    <span className="block text-xs tabular-nums text-muted">{total ? formatDuration(total) : '—'}</span>
                  </span>
                </button>
                {list.map((e) => (
                  <EntryChip key={e.id} entry={e} />
                ))}
                <button
                  type="button"
                  aria-label={`Registrar el ${d}`}
                  onClick={() => openEntryForm({ date: d })}
                  className="flex h-11 items-center justify-center rounded-lg border border-dashed border-line text-muted hover:border-accent hover:text-accent"
                >
                  <Icon name="plus" size={18} />
                </button>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
