'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ISODate } from '@/domain/types';
import { Button, Sheet } from './primitives';

export interface EntryFormRequest {
  entryId?: string;
  date?: ISODate;
  method?: 'duration' | 'range' | 'timer' | 'pomodoro';
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface UIValue {
  entryForm: EntryFormRequest | null;
  sleepForm: { entryId?: string } | null;
  detailId: string | null;
  timerOpen: boolean;
  openEntryForm(r?: EntryFormRequest): void;
  openSleepForm(entryId?: string): void;
  openDetail(id: string): void;
  setTimerOpen(v: boolean): void;
  closeAll(): void;
  confirm(o: ConfirmOptions): Promise<boolean>;
  toast(msg: string): void;
}

const Ctx = createContext<UIValue | null>(null);

export function useUI() {
  const v = useContext(Ctx);
  if (!v) throw new Error('UIProvider ausente');
  return v;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [entryForm, setEntryForm] = useState<EntryFormRequest | null>(null);
  const [sleepForm, setSleepForm] = useState<{ entryId?: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => {
    setConfirmState(o);
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, []);

  const answer = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setConfirmState(null);
  }, []);

  const value = useMemo<UIValue>(
    () => ({
      entryForm,
      sleepForm,
      detailId,
      timerOpen,
      openEntryForm: (r = {}) => {
        setDetailId(null);
        setEntryForm(r);
      },
      openSleepForm: (entryId) => {
        setDetailId(null);
        setSleepForm({ entryId });
      },
      openDetail: setDetailId,
      setTimerOpen,
      closeAll: () => {
        setEntryForm(null);
        setSleepForm(null);
        setDetailId(null);
      },
      confirm,
      toast,
    }),
    [entryForm, sleepForm, detailId, timerOpen, confirm, toast],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Sheet
        open={!!confirmState}
        onClose={() => answer(false)}
        title={confirmState?.title ?? ''}
        footer={
          <>
            <Button className="flex-1" onClick={() => answer(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
              {confirmState?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{confirmState?.message}</p>
      </Sheet>
      {toastMsg && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-[60] flex justify-center px-4"
        >
          <div className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg shadow-lg animate-fade">{toastMsg}</div>
        </div>
      )}
    </Ctx.Provider>
  );
}
