'use client';

import { useMemo, useState } from 'react';
import { formatDayLong, formatDayShort, formatMonthYear } from '@/domain/format';
import { addDays, addMonths, startOfWeek } from '@/domain/time';
import type { CalendarView, ISODate } from '@/domain/types';
import { useStore } from '@/state/store';
import { readLocal, useToday, writeLocal } from '../hooks';
import { Icon } from '../icons';
import { Button, IconButton, Segmented } from '../primitives';
import { useUI } from '../ui-context';
import { MonthView } from './MonthView';
import { CategorySummary, DayList, groupByDate } from './shared';
import { WeekView } from './WeekView';

export function RegisterView() {
  const { snapshot } = useStore();
  const ui = useUI();
  const today = useToday();
  const ws = snapshot.settings.weekStartsOn;
  const [view, setView] = useState<CalendarView>(snapshot.settings.defaultCalendarView);
  const [cursor, setCursor] = useState<ISODate>(today);
  const byDate = useMemo(() => groupByDate(snapshot.entries), [snapshot.entries]);

  const step = (dir: -1 | 1) =>
    setCursor((c) => (view === 'day' ? addDays(c, dir) : view === 'week' ? addDays(c, 7 * dir) : addMonths(c, dir)));

  const weekStart = startOfWeek(cursor, ws);
  const title =
    view === 'day'
      ? formatDayLong(cursor)
      : view === 'week'
        ? `${formatDayShort(weekStart)} – ${formatDayShort(addDays(weekStart, 6))}`
        : formatMonthYear(cursor);

  const [sleepDismissed, setSleepDismissed] = useState(() => readLocal('timeflow.sleepHint') === today);
  const hasSleepToday = (byDate.get(today) ?? []).some((e) => e.method === 'sleep');
  const showSleepHint = !hasSleepToday && !sleepDismissed && !!snapshot.settings.sleepActivityId && new Date().getHours() >= 4;

  const isCurrent =
    view === 'day' ? cursor === today : view === 'week' ? weekStart === startOfWeek(today, ws) : cursor.slice(0, 7) === today.slice(0, 7);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 font-display text-2xl font-semibold tracking-tight">Registro</h1>
          <IconButton icon="moon" label="Registrar sueño" onClick={() => ui.openSleepForm()} variant="secondary" />
          <Button icon="plus" variant="primary" className="hidden md:inline-flex" onClick={() => ui.openEntryForm({ date: view === 'week' && !isCurrent ? weekStart : cursor })}>
            Registrar
          </Button>
        </div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'Día' },
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mes' },
          ]}
          className="md:max-w-sm"
        />
        <div className="flex items-center gap-1">
          <IconButton icon="left" label="Anterior" onClick={() => step(-1)} />
          <p className="min-w-0 flex-1 truncate text-center font-display text-base font-semibold first-letter:uppercase md:flex-none md:px-2 md:text-left">{title}</p>
          <IconButton icon="right" label="Siguiente" onClick={() => step(1)} />
          <Button onClick={() => setCursor(today)} disabled={isCurrent} className="ml-1 md:ml-2">
            Hoy
          </Button>
        </div>
      </header>

      {showSleepHint && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-4 text-sm">
          <Icon name="moon" size={18} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">Falta el sueño de anoche.</span>
          <Button variant="primary" onClick={() => ui.openSleepForm()}>Registrar</Button>
          <IconButton
            icon="x"
            label="Ocultar sugerencia"
            onClick={() => {
              writeLocal('timeflow.sleepHint', today);
              setSleepDismissed(true);
            }}
          />
        </div>
      )}

      {view === 'week' && (
        <WeekView
          weekStart={weekStart}
          byDate={byDate}
          today={today}
          onOpenDay={(d) => {
            setCursor(d);
            setView('day');
          }}
        />
      )}
      {view === 'month' && <MonthView cursor={cursor} selected={cursor} onSelect={setCursor} byDate={byDate} today={today} />}
      {view === 'day' && (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <DayList entries={byDate.get(cursor) ?? []} />
          <div className="rounded-2xl border border-line bg-surface p-4">
            <CategorySummary entries={byDate.get(cursor) ?? []} title="Resumen del día" />
          </div>
        </div>
      )}
    </div>
  );
}
