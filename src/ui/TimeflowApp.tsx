'use client';

import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from '@/state/store';
import { AnalysisView } from './analysis/AnalysisView';
import { EntryDetail } from './entry/EntryDetail';
import { EntryForm } from './entry/EntryForm';
import { SleepForm } from './entry/SleepForm';
import { Icon } from './icons';
import type { IconName } from './icons';
import { cx } from './primitives';
import { RegisterView } from './register/RegisterView';
import { SettingsView } from './settings/SettingsView';
import { TimerBar, TimerSheet } from './timer/Timer';
import { UIProvider, useUI } from './ui-context';

type Module = 'registro' | 'analisis' | 'configuracion';
const NAV: { id: Module; label: string; icon: IconName }[] = [
  { id: 'registro', label: 'Registro', icon: 'calendar' },
  { id: 'analisis', label: 'Análisis', icon: 'chart' },
  { id: 'configuracion', label: 'Configuración', icon: 'gear' },
];

const isModule = (h: string): h is Module => NAV.some((n) => n.id === h);

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <p className="font-display text-xl font-semibold tracking-tight text-muted">TIMEFLOW</p>
    </div>
  );
}

function Logo() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="rgb(var(--accent))" />
        <path d="M9 11h14M16 11v12" stroke="rgb(var(--accent-fg))" strokeWidth="3" strokeLinecap="round" />
        <circle cx="22.5" cy="21.5" r="2.5" fill="rgb(var(--accent-fg))" />
      </svg>
      TIMEFLOW
    </span>
  );
}

function Shell() {
  const { snapshot, persistent } = useStore();
  const ui = useUI();
  const [mod, setMod] = useState<Module>('registro');

  useEffect(() => {
    const read = () => {
      const h = location.hash.slice(1);
      if (isModule(h)) setMod(h);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const go = (m: Module) => {
    setMod(m);
    try {
      history.replaceState(null, '', `#${m}`);
    } catch {
      /* entorno sin history */
    }
    window.scrollTo({ top: 0 });
  };

  const hasTimer = !!snapshot.timer;

  return (
    <div className="min-h-dvh text-fg lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-line bg-surface px-4 py-6 lg:flex">
        <Logo />
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => go(n.id)}
              aria-current={mod === n.id ? 'page' : undefined}
              className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold', mod === n.id ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface2 hover:text-fg')}
            >
              <Icon name={n.icon} /> {n.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => ui.openEntryForm({})}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accentfg"
        >
          <Icon name="plus" size={18} /> Nuevo registro
        </button>
      </aside>

      <div className="min-w-0 flex-1">
      {hasTimer && (
        <div
          className="sticky top-0 z-30 border-b border-line bg-bg/90 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] backdrop-blur lg:px-8"
          style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))', paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))' }}
        >
          <div className="mx-auto max-w-7xl">
            <TimerBar />
          </div>
        </div>
      )}
      <main
        className={cx(
          'mx-auto w-full min-w-0 max-w-7xl px-4 pb-32 lg:px-8 lg:pb-10',
          hasTimer ? 'pt-4 lg:pt-6' : 'pt-[calc(1rem+env(safe-area-inset-top,0px))] lg:pt-8',
        )}
        style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))', paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))' }}
      >
        {!persistent && (
          <p className="mb-4 rounded-xl bg-warn/15 px-3 py-2 text-sm">
            El almacenamiento local no está disponible en este navegador: los datos se perderán al cerrar.
          </p>
        )}
        {mod === 'registro' && <RegisterView />}
        {mod === 'analisis' && <AnalysisView />}
        {mod === 'configuracion' && <SettingsView />}
      </main>
      </div>

      {/* Móvil: FAB + navegación inferior */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <div className="pointer-events-auto flex flex-col gap-2 px-3 pb-2" style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))', paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))' }}>
          {mod === 'registro' && (
            <button
              type="button"
              aria-label="Nuevo registro"
              onClick={() => ui.openEntryForm({})}
              className="ml-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accentfg shadow-lg shadow-accent/30"
            >
              <Icon name="plus" size={26} />
            </button>
          )}
        </div>
        <nav
          className="pointer-events-auto grid grid-cols-3 border-t border-line bg-surface/95 backdrop-blur"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}
        >
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => go(n.id)}
              aria-current={mod === n.id ? 'page' : undefined}
              className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', mod === n.id ? 'text-accent' : 'text-muted')}
            >
              <Icon name={n.icon} size={22} />
              {n.label}
            </button>
          ))}
        </nav>
      </div>

      <EntryForm />
      <SleepForm />
      <EntryDetail />
      <TimerSheet />
    </div>
  );
}

export default function TimeflowApp() {
  return (
    <StoreProvider fallback={<Splash />}>
      <UIProvider>
        <Shell />
      </UIProvider>
    </StoreProvider>
  );
}
