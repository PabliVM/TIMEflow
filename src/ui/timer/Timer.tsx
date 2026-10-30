'use client';

import { formatClock } from '@/domain/format';
import { categoryColor } from '@/domain/hierarchy';
import { elapsedSeconds, remainingSeconds } from '@/domain/timer';
import type { TimerState } from '@/domain/types';
import { useStore } from '@/state/store';
import { useNow } from '../hooks';
import { Button, IconButton, Sheet, cx } from '../primitives';
import { useUI } from '../ui-context';

function useTimerLabel(t: TimerState) {
  const { lookup } = useStore();
  const d = t.draft;
  const sub = d.subactivities.length === 1 ? lookup.subactivity.get(d.subactivities[0].subactivityId)?.name : undefined;
  return sub ?? (d.activityId && lookup.activity.get(d.activityId)?.name) ?? lookup.category.get(d.categoryId)?.name ?? 'Actividad';
}

function useTimerControls() {
  const store = useStore();
  const ui = useUI();
  return {
    pause: () => store.pauseTimer(),
    resume: () => store.resumeTimer(),
    finish: async () => {
      const e = await store.finishTimer();
      if (e) {
        ui.setTimerOpen(false);
        ui.toast('Registro guardado');
      }
    },
    discard: async () => {
      const ok = await ui.confirm({ title: 'Descartar temporizador', message: 'No se guardará ningún registro de esta sesión.', confirmLabel: 'Descartar', danger: true });
      if (ok) {
        await store.discardTimer();
        ui.setTimerOpen(false);
      }
    },
  };
}

/** Cronómetro fijo arriba, visible desde cualquier pantalla. */
export function TimerBar() {
  const { snapshot, lookup } = useStore();
  const t = snapshot.timer;
  if (!t) return null;
  return <TimerBarInner t={t} color={categoryColor(lookup, t.draft.categoryId)} />;
}

function TimerBarInner({ t, color }: { t: TimerState; color: string }) {
  const now = useNow(t.status === 'running');
  const label = useTimerLabel(t);
  const c = useTimerControls();
  const { setTimerOpen } = useUI();
  const remaining = remainingSeconds(t, now);
  const paused = t.status === 'paused';
  return (
    <div
      className="flex items-center gap-2 rounded-2xl border bg-surface p-1.5 pl-3 shadow-md"
      style={{ borderColor: `color-mix(in srgb, ${color} 55%, rgb(var(--line)))` }}
    >
      <button type="button" onClick={() => setTimerOpen(true)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', !paused && 'animate-pulse')} style={{ background: color }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{label}</span>
          <span className="block text-xs text-muted">{paused ? 'En pausa' : t.mode === 'pomodoro' ? 'Pomodoro' : 'En curso'}</span>
        </span>
        <span className="font-mono text-lg font-semibold tabular-nums">{formatClock(remaining ?? elapsedSeconds(t, now))}</span>
      </button>
      {paused ? <IconButton icon="play" label="Reanudar" onClick={c.resume} variant="secondary" /> : <IconButton icon="pause" label="Pausar" onClick={c.pause} variant="secondary" />}
      <Button icon="stop" variant="primary" onClick={c.finish} aria-label="Finalizar" className="px-3">
        Finalizar
      </Button>
    </div>
  );
}

export function TimerSheet() {
  const { snapshot, lookup } = useStore();
  const { timerOpen, setTimerOpen } = useUI();
  const t = snapshot.timer;
  if (!timerOpen || !t) return null;
  return <TimerSheetInner t={t} color={categoryColor(lookup, t.draft.categoryId)} onClose={() => setTimerOpen(false)} />;
}

function TimerSheetInner({ t, color, onClose }: { t: TimerState; color: string; onClose: () => void }) {
  const now = useNow(t.status === 'running');
  const label = useTimerLabel(t);
  const c = useTimerControls();
  const elapsed = elapsedSeconds(t, now);
  const remaining = remainingSeconds(t, now);
  const paused = t.status === 'paused';
  const R = 88;
  const C = 2 * Math.PI * R;
  const subtitle = t.draft.notes || (t.mode === 'pomodoro' ? `${Math.round((t.plannedDurationSeconds ?? 0) / 60)} min` : 'Inicio guardado al segundo');
  const ratio = t.plannedDurationSeconds ? Math.min(1, elapsed / t.plannedDurationSeconds) : null;
  return (
    <Sheet
      open
      onClose={onClose}
      title={t.mode === 'pomodoro' ? 'Pomodoro' : 'Temporizador'}
      footer={
        <>
          <Button variant="ghost" className="text-danger" onClick={c.discard}>Descartar</Button>
          {paused ? (
            <Button icon="play" className="flex-1" onClick={c.resume}>Reanudar</Button>
          ) : (
            <Button icon="pause" className="flex-1" onClick={c.pause}>Pausar</Button>
          )}
          <Button icon="stop" variant="primary" className="flex-1" onClick={c.finish}>Finalizar ahora</Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="relative flex h-52 w-52 items-center justify-center">
          <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(var(--surface-2))" strokeWidth="10" />
            <circle
              cx="100" cy="100" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={ratio === null ? (paused ? C : C * 0.25) : C * (1 - ratio)}
              className={cx(ratio === null && !paused && 'origin-center animate-spin-slow')}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="text-center">
            <p className="font-mono text-4xl font-semibold tabular-nums">{formatClock(remaining ?? elapsed)}</p>
            <p className="text-xs uppercase tracking-wide text-muted">{remaining !== null ? 'restante' : paused ? 'en pausa' : 'transcurrido'}</p>
          </div>
        </div>
        <div className="text-center">
          <p className="font-display text-xl font-semibold">{label}</p>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        <dl className="grid w-full grid-cols-2 gap-2 text-center text-sm">
          <div className="rounded-xl bg-surface2 p-3">
            <dt className="text-xs text-muted">Trabajado</dt>
            <dd className="font-mono font-semibold tabular-nums">{formatClock(elapsed)}</dd>
          </div>
          <div className="rounded-xl bg-surface2 p-3">
            <dt className="text-xs text-muted">Inicio</dt>
            <dd className="font-mono font-semibold tabular-nums">{new Date(t.startedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</dd>
          </div>
        </dl>
      </div>
    </Sheet>
  );
}
