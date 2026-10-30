'use client';

import { useState } from 'react';
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

type Tab = 'new' | 'pomodoro';
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
  const [tab, setTab] = useState<Tab>(req.method === 'pomodoro' && !existing ? 'pomodoro' : 'new');
  const [date, setDate] = useState(existing?.date ?? req.date ?? todayKey());
  const [sel, setSel] = useState<Selection>(() => ({
    categoryId: existing?.categoryId,
    activityId: existing?.activityId,
    subs: (existing ? (subsByEntry.get(existing.id) ?? []) : []).map((l) => ({ subactivityId: l.subactivityId, durationSeconds: l.durationSeconds })),
  }));
  const initMin = existing ? Math.round(existing.durationSeconds / 60) : 0;
  const [hours, setHours] = useState(existing ? String(Math.floor(initMin / 60)) : '');
  const [minutes, setMinutes] = useState(existing ? String(initMin % 60) : '');
  const [start, setStart] = useState(existing?.startAt ? timeOfDay(existing.startAt) : '');
  const [end, setEnd] = useState(existing?.endAt ? timeOfDay(existing.endAt) : '');
  const [goalId, setGoalId] = useState(existing?.goalId ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [pomo, setPomo] = useState(String(snapshot.settings.pomodoroDurations[0] ?? 25));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const range = start && end ? computeRange(date, start, end) : null;
  const goals = snapshot.goals.filter((g) => !g.archived || g.id === goalId);
  const timerActive = !!snapshot.timer;

  const setDuration = (totalMin: number) => {
    setHours(String(Math.floor(totalMin / 60)));
    setMinutes(String(totalMin % 60));
  };

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
    const typed = Math.round((Number(hours || 0) * 60 + Number(minutes || 0)) * 60);
    let durationSeconds = typed;
    let startAt: string | undefined;
    let endAt: string | undefined;
    const errs: string[] = [];
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
      onClose={close}
      title={existing ? 'Editar registro' : 'Nuevo registro'}
      footer={
        tab === 'pomodoro' ? (
          <>
            <Button className="flex-1" onClick={close}>Cancelar</Button>
            <Button className="flex-[2]" variant="primary" icon="play" onClick={startTimer} disabled={busy || timerActive}>Iniciar pomodoro</Button>
          </>
        ) : (
          <>
            <Button className="flex-1" onClick={close}>Cancelar</Button>
            {!existing && (
              <Button className="flex-1" icon="play" onClick={startTimer} disabled={busy || timerActive} title="Empieza a cronometrar ahora">
                Iniciar
              </Button>
            )}
            <Button className="flex-1" variant="primary" onClick={save} disabled={busy}>Guardar</Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        {!existing && (
          <Segmented
            value={tab}
            onChange={(v) => { setTab(v); setErrors([]); }}
            options={[{ value: 'new', label: 'Nuevo' }, { value: 'pomodoro', label: 'Pomodoro' }]}
            size="sm"
          />
        )}

        {timerActive && !existing && (
          <p className="rounded-xl bg-warn/15 p-3 text-sm">Ya hay un cronómetro en marcha: finalízalo desde la barra superior para iniciar otro.</p>
        )}

        {tab === 'new' && (
          <Field label="Fecha">{(fid) => <Input id={fid} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
        )}

        <HierarchyPicker value={sel} onChange={setSel} />

        {tab === 'new' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Horas">{(fid) => <Input id={fid} type="number" inputMode="numeric" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" />}</Field>
              <Field label="Minutos">{(fid) => <Input id={fid} type="number" inputMode="numeric" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" />}</Field>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK.map((m) => (
                <button key={m} type="button" onClick={() => setDuration(m)} className="min-h-10 rounded-full border border-line px-3.5 text-sm hover:bg-surface2">
                  {formatDuration(m * 60)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={lockedTimes ? 'Hora inicio' : 'Hora inicio · opcional'}>{(fid) => <Input id={fid} type="time" value={start} onChange={(e) => setTimes(e.target.value, end)} />}</Field>
              <Field label={lockedTimes ? 'Hora fin' : 'Hora fin · opcional'}>{(fid) => <Input id={fid} type="time" value={end} onChange={(e) => setTimes(start, e.target.value)} />}</Field>
            </div>
            {range && (
              <p className="text-sm text-muted">
                Intervalo <strong className="text-fg">{formatDuration(range.seconds)}</strong>
                {range.crossesMidnight && ' · termina al día siguiente'}. Puedes reducir la duración para descontar interrupciones.
              </p>
            )}
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

        {goals.length > 0 && (
          <Field label="Objetivo relacionado · opcional">
            {(fid) => (
              <Select id={fid} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                <option value="">Ninguno</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            )}
          </Field>
        )}

        <Field label="Notas · opcional">{(fid) => <Textarea id={fid} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />}</Field>

        {errors.length > 0 && (
          <ul className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
