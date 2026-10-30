'use client';

import { formatDayLong, formatDuration, formatTime } from '@/domain/format';
import { categoryColor, entryLabel, entryPath } from '@/domain/hierarchy';
import { METHOD_LABEL } from '@/domain/types';
import { useStore } from '@/state/store';
import { Button, Dot, Sheet } from '../primitives';
import { useUI } from '../ui-context';

export function useEntryActions() {
  const store = useStore();
  const ui = useUI();
  return {
    edit(id: string) {
      const e = store.snapshot.entries.find((x) => x.id === id);
      if (!e) return;
      if (e.method === 'sleep') ui.openSleepForm(id);
      else ui.openEntryForm({ entryId: id });
    },
    async duplicate(id: string) {
      await store.duplicateEntry(id);
      ui.toast('Registro duplicado');
    },
    async remove(id: string) {
      const ok = await ui.confirm({ title: 'Eliminar registro', message: 'Se eliminará el registro y su tiempo. No se puede deshacer.', confirmLabel: 'Eliminar', danger: true });
      if (!ok) return false;
      await store.deleteEntry(id);
      ui.toast('Registro eliminado');
      return true;
    },
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-line py-2.5 text-sm last:border-0">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

export function EntryDetail() {
  const { detailId, openDetail } = useUI();
  const { snapshot, lookup, subsByEntry } = useStore();
  const actions = useEntryActions();
  const e = detailId ? snapshot.entries.find((x) => x.id === detailId) : undefined;
  if (!e) return null;
  const use24 = snapshot.settings.use24h;
  const subs = subsByEntry.get(e.id) ?? [];
  const goal = e.goalId ? snapshot.goals.find((g) => g.id === e.goalId) : undefined;
  const close = () => openDetail('');

  return (
    <Sheet
      open
      onClose={close}
      title={entryLabel(e, subs, lookup)}
      footer={
        <>
          <Button icon="trash" variant="ghost" className="text-danger" onClick={async () => (await actions.remove(e.id)) && close()}>
            <span className="sr-only sm:not-sr-only">Eliminar</span>
          </Button>
          <Button icon="copy" className="flex-1" onClick={() => actions.duplicate(e.id)}>Duplicar</Button>
          <Button icon="edit" variant="primary" className="flex-1" onClick={() => actions.edit(e.id)}>Editar</Button>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-2 text-sm">
        <Dot color={categoryColor(lookup, e.categoryId)} />
        <span className="truncate">{entryPath(e, lookup)}</span>
      </div>
      <p className="font-mono text-3xl font-semibold tabular-nums">{formatDuration(e.durationSeconds)}</p>
      <dl className="mt-4">
        <Row label="Fecha">{formatDayLong(e.date)}</Row>
        {e.startAt && e.endAt && (
          <Row label="Horario">
            {formatTime(e.startAt, use24)} – {formatTime(e.endAt, use24)}
            {!!e.pausedSeconds && <span className="text-muted"> · pausas {formatDuration(e.pausedSeconds)}</span>}
          </Row>
        )}
        <Row label="Método">{METHOD_LABEL[e.method]}</Row>
        {subs.length > 0 && (
          <Row label="Subactividades">
            <ul className="flex flex-col gap-1">
              {subs.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span className="truncate">{lookup.subactivity.get(s.subactivityId)?.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">{s.durationSeconds != null ? formatDuration(s.durationSeconds) : subs.length === 1 ? 'todo' : 'realizada'}</span>
                </li>
              ))}
            </ul>
          </Row>
        )}
        {e.sleepQuality && <Row label="Calidad">{e.sleepQuality} / 5</Row>}
        {goal && <Row label="Objetivo">{goal.name}</Row>}
        {e.notes && <Row label="Notas">{e.notes}</Row>}
      </dl>
    </Sheet>
  );
}
