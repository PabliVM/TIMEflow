'use client';

import { useState } from 'react';
import { computeRange, validateEntry } from '@/domain/entries';
import { formatDuration, maskClockInput, parseClockInput, toClockInput } from '@/domain/format';
import { uuid } from '@/domain/ids';
import { localTimeZone, nowIso, timeOfDay, todayKey } from '@/domain/time';
import type { EntryMethod, TimeEntry } from '@/domain/types';
import { useStore, UserError } from '@/state/store';
import { Button, Field, FormSection, Input, Select, Sheet, Textarea } from '../primitives';
import { useUI } from '../ui-context';
import type { EntryFormRequest } from '../ui-context';
import { HierarchyPicker } from './HierarchyPicker';
import type { Selection } from './HierarchyPicker';

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
  const lockedTimes = !!existing && (existing.method === 'timer' || existing.method === 'pomodoro');

  const [id] = useState(() => existing?.id ?? uuid());
  const [date, setDate] = useState(existing?.date ?? req.date ?? todayKey());
  const [sel, setSel] = useState<Selection>(() => ({
    categoryId: existing?.categoryId,
    activityId: existing?.activityId,
    subs: (existing ? (subsByEntry.get(existing.id) ?? []) : []).map((l) => ({ subactivityId: l.subactivityId, durationSeconds: l.durationSeconds })),
  }));
  const initMin = existing ? Math.round(existing.durationSeconds / 60) : 0;
  const [dur, setDur] = useState(existing ? toClockInput(initMin) : '');
  const [start, setStart] = useState(existing?.startAt ? timeOfDay(existing.startAt) : '');
  const [end, setEnd] = useState(existing?.endAt ? timeOfDay(existing.endAt) : '');
  const [goalId, setGoalId] = useState(existing?.goalId ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const range = start && end ? computeRange(date, start, end) : null;
  const goals = snapshot.goals.filter((g) => !g.archived || g.id === goalId);
  const timerActive = !!snapshot.timer;

  const path = sel.categoryId
    ? [
        store.lookup.category.get(sel.categoryId)?.name,
        sel.activityId && store.lookup.activity.get(sel.activityId)?.name,
        sel.subs.length ? sel.subs.map((x) => store.lookup.subactivity.get(x.subactivityId)?.name).join(', ') : '',
      ].filter(Boolean).join(' › ')
    : 'Sin elegir';
  const whenSummary = range
    ? `${start}–${end}`
    : parseClockInput(dur)
      ? formatDuration(parseClockInput(dur)!)
      : 'Sin indicar';

  const setDuration = (totalMin: number) => setDur(toClockInput(totalMin));
  const parsedDur = parseClockInput(dur);

  /** Al completar inicio y final, la duración se rellena con el intervalo. */
  const setTimes = (s: string, e: string) => {
    setStart(s);
    setEnd(e);
    const r = s && e ? computeRange(date, s, e) : null;
    if (r) setDuration(Math.round(r.seconds / 60));
  };

  const close = () => ui.closeAll();

  const save = async () => {
    if (busy) return;
    if (parsedDur === null) return setErrors(['Duración no válida: usa H:MM (los minutos van de 00 a 59).']);
    const typed = parsedDur;
    let durationSeconds = typed;
    let startAt: string | undefined;
    let endAt: string | undefined;
    const errs: string[] = [];
    if (!typed && !start && !end && !lockedTimes) {
      return setErrors(['Indica la duración o la hora de inicio y fin.']);
    }
    if (start || end || lockedTimes) {
      if (!range) errs.push('Indica hora de inicio y final distintas, o deja ambas vacías.');
      else {
        startAt = range.startAt;
        endAt = range.endAt;
        durationSeconds = typed || range.seconds;
        if (durationSeconds > range.seconds) errs.push('La duración no puede superar el intervalo entre inicio y final.');
      }
    }
    errs.push(...validateEntry({ categoryId: sel.categoryId, durationSeconds, subactivities: sel.subs }));
    if (errs.length) return setErrors(errs);
    const method: EntryMethod =
      existing && existing.method !== 'duration' && existing.method !== 'range' ? existing.method : startAt ? 'range' : 'duration';
    const t = nowIso();
    const entry = {
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
    const subErr = validateEntry({ categoryId: sel.categoryId, durationSeconds: 24 * 3600, subactivities: sel.subs });
    if (subErr.length) return setErrors(subErr);
    setBusy(true);
    try {
      await store.startTimer(
        { categoryId: sel.categoryId, activityId: sel.activityId, subactivities: sel.subs, goalId: goalId || undefined, notes: notes.trim() },
        'normal',
      );
      ui.toast('Cronómetro iniciado');
      close();
    } catch (e) {
      setErrors([e instanceof UserError ? e.message : 'No se pudo iniciar.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      wide
      onClose={close}
      title={existing ? 'Editar registro' : 'Nuevo registro'}
      footer={
        <>
            <Button className="flex-1" onClick={close}>Cancelar</Button>
            {!existing && (
              <Button className="flex-1" icon="play" onClick={startTimer} disabled={busy || timerActive} title="Empieza a cronometrar ahora">
                Iniciar
              </Button>
            )}
            <Button className="flex-1" variant="primary" onClick={save} disabled={busy}>Guardar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {timerActive && !existing && (
          <p className="rounded-xl bg-warn/15 p-3 text-sm">Ya hay un cronómetro en marcha: finalízalo desde la barra superior para iniciar otro.</p>
        )}

        <FormSection step={1} title="Qué has hecho" summary={path}>
          <HierarchyPicker value={sel} onChange={setSel} />
        </FormSection>

        <FormSection step={2} title="Cuándo y cuánto" summary={whenSummary}>
            <Field label="Fecha">{(fid) => <Input id={fid} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
            <p className="rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">Indica la duración, el horario o ambos. Con horario, la duración se calcula sola.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <Field label="Duración" hint={parsedDur ? `= ${formatDuration(parsedDur)}` : 'H:MM · ej.: 130 → 1:30'}>
                  {(fid) => (
                    <Input
                      id={fid}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0:00"
                      value={dur}
                      onChange={(e) => setDur(maskClockInput(e.target.value))}
                      className="max-w-[10rem] text-center font-mono text-2xl tabular-nums sm:text-2xl"
                    />
                  )}
                </Field>
                <div className="flex flex-wrap gap-2">
                  {QUICK.map((m) => (
                    <button key={m} type="button" onClick={() => setDuration(m)} className="min-h-10 rounded-full border border-line px-3 text-sm hover:bg-surface2">
                      {formatDuration(m * 60)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3 border-t border-line pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Hora inicio">{(fid) => <Input id={fid} type="time" value={start} onChange={(e) => setTimes(e.target.value, end)} />}</Field>
                  <Field label="Hora fin">{(fid) => <Input id={fid} type="time" value={end} onChange={(e) => setTimes(start, e.target.value)} />}</Field>
                </div>
                <p className="text-xs text-muted">
                  {range ? (
                    <>
                      Intervalo <strong className="text-fg">{formatDuration(range.seconds)}</strong>
                      {range.crossesMidnight && ' · termina al día siguiente'}. Reduce la duración para descontar interrupciones.
                    </>
                  ) : lockedTimes ? (
                    'Obligatorio en registros del cronómetro.'
                  ) : (
                    'Opcional.'
                  )}
                </p>
              </div>
            </div>
          </FormSection>
        <FormSection step={3} title="Detalles" summary="opcional">
          {goals.length > 0 && (
            <Field label="Objetivo relacionado">
              {(fid) => (
                <Select id={fid} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                  <option value="">Ninguno</option>
                  {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
              )}
            </Field>
          )}
          <Field label="Notas">{(fid) => <Textarea id={fid} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />}</Field>
        </FormSection>

        {errors.length > 0 && (
          <ul className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
