'use client';

import { useMemo, useState } from 'react';
import { computeRange, validateEntry } from '@/domain/entries';
import { formatDuration } from '@/domain/format';
import { uuid } from '@/domain/ids';
import { localTimeZone, nowIso, timeOfDay, todayKey } from '@/domain/time';
import type { EntryMethod, TimeEntry } from '@/domain/types';
import { useStore, UserError } from '@/state/store';
import { Button, Field, Input, Segmented, Select, Sheet, Textarea, cx } from '../primitives';
import { useUI } from '../ui-context';
import type { EntryFormRequest } from '../ui-context';
import { HierarchyPicker } from './HierarchyPicker';
import type { Selection } from './HierarchyPicker';

type Tab = 'duration' | 'range' | 'timer' | 'pomodoro';
const QUICK = [15, 30, 45, 60, 90];

export function EntryForm() {
  const { entryForm } = useUI();
  if (!entryForm) return null;
  return <EntryFormInner key={entryForm.entryId ?? 'new'} req={entryForm} />;
}

function EntryFormInner({ req }: { req: EntryFormRequest }) {
  const store = useStore();
  const ui = useUI();
  const { snapshot, subsByEntry } = store;
  const existing = req.entryId ? snapshot.entries.find((e) => e.id === req.entryId) : undefined;
  const lockedTimes = existing && (existing.method === 'timer' || existing.method === 'pomodoro');

  const [id] = useState(() => existing?.id ?? uuid());
  const [tab, setTab] = useState<Tab>(() => (existing ? (existing.startAt ? 'range' : 'duration') : (req.method ?? 'duration')));
  const [date, setDate] = useState(existing?.date ?? req.date ?? todayKey());
  const [sel, setSel] = useState<Selection>(() => ({
    categoryId: existing?.categoryId,
    activityId: existing?.activityId,
    subs: (existing ? (subsByEntry.get(existing.id) ?? []) : []).map((l) => ({ subactivityId: l.subactivityId, durationSeconds: l.durationSeconds })),
  }));
  const initMin = existing && !existing.startAt ? Math.round(existing.durationSeconds / 60) : 0;
  const [hours, setHours] = useState(existing && !existing.startAt ? String(Math.floor(initMin / 60)) : '');
  const [minutes, setMinutes] = useState(existing && !existing.startAt ? String(initMin % 60) : '');
  const [start, setStart] = useState(existing?.startAt ? timeOfDay(existing.startAt) : '');
  const [end, setEnd] = useState(existing?.endAt ? timeOfDay(existing.endAt) : '');
  const initRange = existing?.startAt && existing.endAt ? (new Date(existing.endAt).getTime() - new Date(existing.startAt).getTime()) / 1000 : 0;
  const [effective, setEffective] = useState(
    existing?.startAt && Math.abs(initRange - existing.durationSeconds) > 30 ? String(Math.round(existing.durationSeconds / 60)) : '',
  );
  const [goalId, setGoalId] = useState(existing?.goalId ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [pomo, setPomo] = useState(String(snapshot.settings.pomodoroDurations[0] ?? 25));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const range = useMemo(() => (tab === 'range' ? computeRange(date, start, end) : null), [tab, date, start, end]);
  const goals = snapshot.goals.filter((g) => !g.archived || g.id === goalId);

  const tabs: { value: Tab; label: string }[] = existing
    ? lockedTimes
      ? [{ value: 'range', label: 'Horario' }]
      : [{ value: 'duration', label: 'Duración' }, { value: 'range', label: 'Horario' }]
    : [
        { value: 'duration', label: 'Duración' },
        { value: 'range', label: 'Horario' },
        { value: 'timer', label: 'Iniciar ahora' },
        { value: 'pomodoro', label: 'Pomodoro' },
      ];

  const close = () => ui.closeAll();

  const save = async () => {
    if (busy) return;
    let durationSeconds = 0;
    let startAt: string | undefined;
    let endAt: string | undefined;
    const errs: string[] = [];
    if (tab === 'duration') {
      durationSeconds = Math.round((Number(hours || 0) * 60 + Number(minutes || 0)) * 60);
    } else {
      if (!range) errs.push('Indica una hora de inicio y otra de finalización distintas.');
      else {
        startAt = range.startAt;
        endAt = range.endAt;
        durationSeconds = effective ? Math.round(Number(effective) * 60) : range.seconds;
        if (durationSeconds > range.seconds) errs.push('La duración efectiva no puede superar el intervalo.');
      }
    }
    errs.push(...validateEntry({ categoryId: sel.categoryId, durationSeconds, subactivities: sel.subs }));
    if (errs.length) return setErrors(errs);
    const method: EntryMethod = existing && existing.method !== 'duration' && existing.method !== 'range' ? existing.method : (tab as EntryMethod);
    const t = nowIso();
    const entry: TimeEntry = {
      ...(existing ?? { createdAt: t, timeZone: localTimeZone() }),
      id,
      date,
      categoryId: sel.categoryId!,
      activityId: sel.activityId,
      startAt,
      endAt,
      durationSeconds,
      method,
      goalId: goalId || undefined,
      notes: notes.trim(),
      updatedAt: t,
    } as TimeEntry;
    setBusy(true);
    try {
      await store.saveEntry(entry, sel.subs);
      ui.toast(existing ? 'Registro actualizado' : 'Registro guardado');
      close();
    } catch {
      setErrors(['No se pudo guardar. Inténtalo de nuevo.']);
    } finally {
      setBusy(false);
    }
  };

  const startTimer = async () => {
    if (busy) return;
    if (!sel.categoryId) return setErrors(['Elige una categoría.']);
    const planned = tab === 'pomodoro' ? Math.round(Number(pomo) * 60) : undefined;
    if (tab === 'pomodoro' && !(planned! > 0 && planned! <= 24 * 3600)) return setErrors(['Duración de pomodoro no válida.']);
    const subErr = validateEntry({ categoryId: sel.categoryId, durationSeconds: planned ?? 24 * 3600, subactivities: sel.subs });
    if (subErr.length) return setErrors(subErr);
    setBusy(true);
    try {
      await store.startTimer(
        { categoryId: sel.categoryId, activityId: sel.activityId, subactivities: sel.subs, goalId: goalId || undefined, notes: notes.trim() },
        tab === 'pomodoro' ? 'pomodoro' : 'normal',
        planned,
      );
      close();
      ui.setTimerOpen(true);
    } catch (e) {
      setErrors([e instanceof UserError ? e.message : 'No se pudo iniciar.']);
    } finally {
      setBusy(false);
    }
  };

  const isTimer = tab === 'timer' || tab === 'pomodoro';
  const timerBlocked = isTimer && !!snapshot.timer;

  return (
    <Sheet
      open
      onClose={close}
      title={existing ? 'Editar registro' : 'Nuevo registro'}
      footer={
        <>
          <Button className="flex-1" onClick={close}>
            Cancelar
          </Button>
          {isTimer ? (
            <Button className="flex-[2]" variant="primary" icon="play" onClick={startTimer} disabled={busy || timerBlocked}>
              {tab === 'pomodoro' ? 'Iniciar pomodoro' : 'Iniciar ahora'}
            </Button>
          ) : (
            <Button className="flex-[2]" variant="primary" onClick={save} disabled={busy}>
              Guardar
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {tabs.length > 1 && <Segmented value={tab} onChange={(v) => { setTab(v); setErrors([]); }} options={tabs} size="sm" />}

        {timerBlocked && (
          <div className="rounded-xl bg-warn/15 p-3 text-sm">
            Ya hay un temporizador activo.{' '}
            <button type="button" className="font-semibold underline" onClick={() => { close(); ui.setTimerOpen(true); }}>
              Ver temporizador
            </button>
          </div>
        )}

        {!isTimer && (
          <Field label="Fecha">{(fid) => <Input id={fid} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
        )}

        <HierarchyPicker value={sel} onChange={setSel} />

        {tab === 'duration' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Horas">{(fid) => <Input id={fid} type="number" inputMode="numeric" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" />}</Field>
              <Field label="Minutos">{(fid) => <Input id={fid} type="number" inputMode="numeric" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" />}</Field>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setHours(String(Math.floor(m / 60))); setMinutes(String(m % 60)); }}
                  className="min-h-10 rounded-full border border-line px-3.5 text-sm hover:bg-surface2"
                >
                  {formatDuration(m * 60)}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'range' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicio">{(fid) => <Input id={fid} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
              <Field label="Final">{(fid) => <Input id={fid} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
            </div>
            <p className="text-sm text-muted">
              {range ? (
                <>
                  Intervalo: <strong className="text-fg">{formatDuration(range.seconds)}</strong>
                  {range.crossesMidnight && ' · termina al día siguiente'}
                </>
              ) : (
                'La duración se calcula automáticamente.'
              )}
            </p>
            <Field label="Duración efectiva (min) · opcional" hint="Para descontar interrupciones. Vacío = intervalo completo.">
              {(fid) => <Input id={fid} type="number" inputMode="numeric" min={1} value={effective} onChange={(e) => setEffective(e.target.value)} />}
            </Field>
          </div>
        )}

        {tab === 'pomodoro' && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Duración</span>
            <div className="flex flex-wrap items-center gap-2">
              {snapshot.settings.pomodoroDurations.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPomo(String(m))}
                  className={cx('min-h-11 min-w-16 rounded-xl border px-4 text-sm font-semibold', String(m) === pomo ? 'border-accent bg-accent/10 text-accent' : 'border-line')}
                >
                  {m} min
                </button>
              ))}
              <Input aria-label="Minutos personalizados" type="number" min={1} className="w-28" value={pomo} onChange={(e) => setPomo(e.target.value)} />
            </div>
            <p className="text-xs text-muted">Se guarda el tiempo real trabajado. Los descansos no se suman.</p>
          </div>
        )}

        {tab === 'timer' && <p className="text-sm text-muted">Se guardará la hora exacta de inicio. Podrás pausar y finalizar desde cualquier pantalla.</p>}

        {goals.length > 0 && (
          <Field label="Objetivo relacionado · opcional">
            {(fid) => (
              <Select id={fid} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                <option value="">Ninguno</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field label="Notas · opcional">{(fid) => <Textarea id={fid} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />}</Field>

        {errors.length > 0 && (
          <ul className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
