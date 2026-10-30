'use client';

import { useEffect, useState } from 'react';
import { getSync, syncAvailable } from '@/data';
import type { SyncStatus } from '@/data/sync';
import { formatDateTime } from '@/domain/format';
import { Button, Card, Field, Input, cx } from '../primitives';
import { useUI } from '../ui-context';

const STATE_LABEL: Record<SyncStatus['state'], string> = {
  'signed-out': 'Sin sesión',
  syncing: 'Sincronizando…',
  synced: 'Sincronizado',
  offline: 'Sin conexión',
  error: 'Error',
};

function useSyncStatus(): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => getSync()?.onStatus(setStatus) as (() => void) | undefined, []);
  return status;
}

/** Cuenta y sincronización entre dispositivos (solo si Supabase está configurado). */
export function SyncCard() {
  const status = useSyncStatus();
  const ui = useUI();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sync = getSync();

  if (!syncAvailable || !sync || !status) return null;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Algo ha fallado.' });
    } finally {
      setBusy(false);
    }
  };

  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 6;

  if (status.state === 'signed-out')
    return (
      <Card title="Sincronización entre dispositivos" className="md:col-span-2">
        <p className="mb-3 text-sm text-muted">Inicia sesión para guardar tus datos en la nube y verlos en el móvil y el ordenador. Sin sesión, todo sigue guardado solo en este dispositivo.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Field label="Contraseña" hint="Mínimo 6 caracteres.">
            {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" disabled={!valid || busy} onClick={() => run(() => sync.signIn(email, password))}>Entrar</Button>
          <Button
            disabled={!valid || busy}
            onClick={() =>
              run(async () => {
                await sync.signUp(email, password);
              })
            }
          >
            Crear cuenta
          </Button>
        </div>
        {msg && <p className={cx('mt-3 rounded-xl p-3 text-sm', msg.ok ? 'bg-accent/10' : 'bg-danger/10 text-danger')}>{msg.text}</p>}
      </Card>
    );

  return (
    <Card title="Sincronización entre dispositivos" className="md:col-span-2">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cx(
            'rounded-full px-2.5 py-0.5 text-xs font-semibold',
            status.state === 'synced' ? 'bg-accent/15 text-accent' : status.state === 'error' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn',
          )}
        >
          {STATE_LABEL[status.state]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{status.email}</span>
      </div>
      <p className="mt-2 text-sm text-muted">
        {status.lastSync ? `Última sincronización: ${formatDateTime(status.lastSync, true)}` : 'Aún no se ha sincronizado.'}
        {status.pending > 0 && ` · ${status.pending} cambios pendientes de subir`}
      </p>
      {status.error && <p className="mt-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">{status.error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button icon="restore" onClick={() => sync.schedule()} disabled={status.state === 'syncing'}>Sincronizar ahora</Button>
        <Button
          variant="ghost"
          onClick={async () => {
            const ok = await ui.confirm({ title: 'Cerrar sesión', message: 'Los datos se quedan en este dispositivo, pero dejarán de sincronizarse.', confirmLabel: 'Cerrar sesión' });
            if (ok) run(() => sync.signOut());
          }}
        >
          Cerrar sesión
        </Button>
      </div>
    </Card>
  );
}
