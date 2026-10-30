'use client';

import { useState } from 'react';
import { computeSleep, validateEntry } from '@/domain/entries';
import { formatDayLong, formatDuration } from '@/domain/format';
import { uuid } from '@/domain/ids';
import { addDays, fromLocalInput, localTimeZone, nowIso, toLocalInput, todayKey } from '@/domain/time';
import type { TimeEntry } from '@/domain/types';
import { useStore } from '@/state/store';
import { Button, Field, Input, Sheet, Textarea, cx } from '../primitives';
import { useUI } from '../ui-context';
import { HierarchyPicker } from './HierarchyPicker';
import type { Selection } from './HierarchyPicker';

export function SleepForm() {
  const { sleepForm } = useUI();
  if (!sleepForm) return null;
  return <SleepFormInner key={sleepForm.entryId ?? 'new'} entryId={sleepForm.entryId} />;
}

function SleepFormInner({ entryId }: { entryId?: string }) {
  const store = useStore();
  const ui = useUI();
  const { snapshot, subsByEntry } = store;
  const st = snapshot.settings;
  const existing = entryId ? snapshot.entries.find((e) => e.id === entryId) : undefined;
  const today = todayKey();
  const [id] = useState(() => existing?.id ?? uuid());
  const [bed, setBed] = useState(existing?.startAt ? toLocalInput(existing.startAt) : `${addDays(today, -1)}T23:00`);
  const [wake, setWake] = useState(existing?.endAt ? toLocalInput(existing.endAt) : `${today}T07:00`);
  const [quality, setQuality] = useState<number | undefined>(existing?.sleepQuality);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [sel, setSel] = useState<Selection>(() =>
    existing
      ? { categoryId: existing.categoryId, activityId: existing.activityId, subs: (subsByEntry.get(existing.id) ?? []).map((l) => ({ subactivityId: l.subactivityId })) }
      : { categoryId: st.sleepCategoryId, activityId: st.sleepActivityId, subs: st.sleepSubactivityId ? [{ subactivityId: st.sleepSubactivityId }] : [] },
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const b = fromLocalInput(bed);
  const w = fromLocalInput(wake);
  const range = b && w ? computeSleep(b, w) : null;
  const close = () => ui.closeAll();

  const save = async () => {
    if (busy) return;
    const errs: string[] = [];
    if (!range) errs.push('La hora de levantarse debe ser posterior a la de acostarse (máximo 24 h).');
    errs.push(...validateEntry({ categoryId: sel.categoryId, durationSeconds: range?.seconds ?? 1, subactivities: [] }));
    if (errs.length || !range) return setErrors(errs);
    const t = nowIso();
    const entry: TimeEntry = {
      id,
      createdAt: existing?.createdAt ?? t,
      updatedAt: t,
      timeZone: existing?.timeZone ?? localTimeZone(),
      date: range.date,
      categoryId: sel.categoryId!,
      activityId: sel.activityId,
      startAt: range.startAt,
      endAt: range.endAt,
      durationSeconds: range.seconds,
      method: 'sleep',
      sleepQuality: quality,
      notes: notes.trim(),
    };
    setBusy(true);
    try {
      await store.saveEntry(entry, sel.subs.map((s) => ({ subactivityId: s.subactivityId })));
      ui.toast('Sueño registrado');
      close();
    } catch {
      setErrors(['No se pudo guardar.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={close}
      title={existing ? 'Editar sueño' : 'Registrar sueño'}
      footer={
        <>
          <Button className="flex-1" onClick={close}>Cancelar</Button>
          <Button className="flex-[2]" variant="primary" onClick={save} disabled={busy}>Guardar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Me acosté">{(fid) => <Input id={fid} type="datetime-local" value={bed} onChange={(e) => setBed(e.target.value)} />}</Field>
          <Field label="Me levanté">{(fid) => <Input id={fid} type="datetime-local" value={wake} onChange={(e) => setWake(e.target.value)} />}</Field>
        </div>
        <div className="rounded-xl bg-surface2 p-3 text-sm">
          {range ? (
            <>
              Duración <strong className="font-mono text-base">{formatDuration(range.seconds)}</strong>
              <span className="block text-muted">Se asigna al {formatDayLong(range.date)} (día de despertar).</span>
            </>
          ) : (
            <span className="text-danger">Revisa las horas.</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Calidad · opcional</span>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={quality === q}
                onClick={() => setQuality(quality === q ? undefined : q)}
                className={cx('h-11 flex-1 rounded-xl border text-sm font-semibold', quality === q ? 'border-accent bg-accent/10 text-accent' : 'border-line')}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium">Categoría del sueño</summary>
          <div className="mt-3">
            <HierarchyPicker value={sel} onChange={setSel} showSubDurations={false} />
          </div>
        </details>
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
