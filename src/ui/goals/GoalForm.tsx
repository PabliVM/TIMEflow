'use client';

import { useState } from 'react';
import { GOAL_STATUS_LABEL } from '@/domain/goals';
import { bySort } from '@/domain/hierarchy';
import { uuid } from '@/domain/ids';
import { nowIso, todayKey } from '@/domain/time';
import type { Goal, GoalStatus, GoalType } from '@/domain/types';
import { useStore, UserError } from '@/state/store';
import { Button, Field, Input, Segmented, Select, Sheet, Textarea, cx } from '../primitives';
import { useUI } from '../ui-context';

export function GoalForm({ goalId, onClose }: { goalId?: string; onClose: () => void }) {
  const { snapshot, saveGoal } = useStore();
  const ui = useUI();
  const existing = goalId ? snapshot.goals.find((g) => g.id === goalId) : undefined;
  const [g, setG] = useState<Goal>(
    () =>
      existing ?? {
        id: uuid(), name: '', description: '', type: 'time', targetValue: 100 * 3600, startDate: todayKey(), status: 'in_progress',
        archived: false, showTenThousand: false, createdAt: nowIso(), updatedAt: nowIso(),
      },
  );
  const [links, setLinks] = useState<{ activityId?: string; subactivityId?: string }[]>(() => snapshot.goalLinks.filter((l) => l.goalId === goalId).map(({ activityId, subactivityId }) => ({ activityId, subactivityId })));
  const [error, setError] = useState('');
  const set = (p: Partial<Goal>) => setG((x) => ({ ...x, ...p }));

  const cats = snapshot.categories.filter((c) => !c.archived && (!g.categoryId || c.id === g.categoryId)).sort(bySort);
  const has = (k: 'activityId' | 'subactivityId', id: string) => links.some((l) => l[k] === id);
  const toggle = (k: 'activityId' | 'subactivityId', id: string) =>
    setLinks(has(k, id) ? links.filter((l) => l[k] !== id) : [...links, k === 'activityId' ? { activityId: id } : { subactivityId: id }]);

  const save = async () => {
    try {
      if (g.type !== 'result' && !(Number(g.targetValue) > 0)) throw new UserError('Indica un valor objetivo mayor que 0.');
      if (g.targetDate && g.targetDate < g.startDate) throw new UserError('La fecha objetivo es anterior al inicio.');
      const completedAt = g.status === 'achieved' ? (g.completedAt ?? nowIso()) : undefined;
      await saveGoal({ ...g, completedAt, targetValue: g.type === 'result' ? undefined : g.targetValue }, links);
      ui.toast('Objetivo guardado');
      onClose();
    } catch (e) {
      setError(e instanceof UserError ? e.message : 'No se pudo guardar.');
    }
  };

  const targetUnit = g.type === 'time' ? 'Horas objetivo' : 'Sesiones objetivo';
  const targetValue = g.targetValue == null ? '' : g.type === 'time' ? String(Math.round(g.targetValue / 3600)) : String(g.targetValue);

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={existing ? 'Editar objetivo' : 'Nuevo objetivo'}
      footer={
        <>
          {existing && (
            <Button variant="ghost" onClick={async () => { await saveGoal({ ...g, archived: !g.archived }, links); ui.toast(g.archived ? 'Objetivo reactivado' : 'Objetivo archivado'); onClose(); }}>
              {g.archived ? 'Reactivar' : 'Archivar'}
            </Button>
          )}
          <Button className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" variant="primary" onClick={save}>Guardar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nombre">{(id) => <Input id={id} value={g.name} onChange={(e) => set({ name: e.target.value })} placeholder="100 horas de inglés" />}</Field>
        <Field label="Descripción · opcional">{(id) => <Textarea id={id} rows={2} value={g.description} onChange={(e) => set({ description: e.target.value })} />}</Field>
        <Segmented<GoalType>
          value={g.type}
          onChange={(type) => set({ type, targetValue: type === 'time' ? 100 * 3600 : type === 'frequency' ? 50 : undefined })}
          options={[{ value: 'time', label: 'Tiempo' }, { value: 'frequency', label: 'Frecuencia' }, { value: 'result', label: 'Resultado' }]}
        />
        {g.type !== 'result' && (
          <Field label={targetUnit}>
            {(id) => (
              <Input id={id} type="number" min={1} inputMode="numeric" value={targetValue}
                onChange={(e) => set({ targetValue: e.target.value === '' ? undefined : g.type === 'time' ? Number(e.target.value) * 3600 : Math.round(Number(e.target.value)) })} />
            )}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio">{(id) => <Input id={id} type="date" value={g.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} />}</Field>
          <Field label="Fecha objetivo · opcional">{(id) => <Input id={id} type="date" value={g.targetDate ?? ''} onChange={(e) => set({ targetDate: e.target.value || undefined })} />}</Field>
        </div>
        <Field label="Estado">
          {(id) => (
            <Select id={id} value={g.status} onChange={(e) => set({ status: e.target.value as GoalStatus })}>
              {(Object.keys(GOAL_STATUS_LABEL) as GoalStatus[]).map((s) => <option key={s} value={s}>{GOAL_STATUS_LABEL[s]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Categoría · opcional" hint="Sin actividades vinculadas, cuenta todo el tiempo de la categoría.">
          {(id) => (
            <Select id={id} value={g.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value || undefined })}>
              <option value="">Ninguna</option>
              {snapshot.categories.filter((c) => !c.archived).sort(bySort).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Actividades vinculadas</span>
          <p className="text-xs text-muted">Actividad: cuenta la duración completa del registro. Subactividad: frecuencia y solo el tiempo individual conocido. Un registro nunca cuenta dos veces.</p>
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto rounded-xl border border-line p-3">
            {cats.map((c) => (
              <div key={c.id} className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.name}</span>
                {snapshot.activities.filter((a) => a.categoryId === c.id && !a.archived).sort(bySort).map((a) => (
                  <div key={a.id} className="ml-3 flex flex-col gap-1">
                    <label className="flex min-h-9 items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={has('activityId', a.id)} onChange={() => toggle('activityId', a.id)} />
                      {a.name}
                    </label>
                    <div className="ml-6 flex flex-wrap gap-1.5">
                      {snapshot.subactivities.filter((s) => s.activityId === a.id && !s.archived).sort(bySort).map((s) => (
                        <button key={s.id} type="button" onClick={() => toggle('subactivityId', s.id)} aria-pressed={has('subactivityId', s.id)}
                          className={cx('min-h-8 rounded-full border px-3 text-xs', has('subactivityId', s.id) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted')}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={g.showTenThousand} onChange={(e) => set({ showTenThousand: e.target.checked })} />
          Mostrar comparación con 10.000 horas
        </label>
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </Sheet>
  );
}
