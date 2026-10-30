import type { Snapshot } from '@/domain/types';
import { mergeIntoRemote, recordId, rowsToOps, rowsToSnapshot, snapshotOps } from './merge';
import type { RemoteRow } from './merge';
import type { Op, Repository } from './repository';

/* ---------- Cola local de cambios pendientes (IndexedDB aparte, no toca los datos) ---------- */

interface OutboxItem {
  key: string;
  store: string;
  id: string;
  data: unknown;
  deleted: boolean;
  ts: number;
}

class SyncStore {
  private db: Promise<IDBDatabase>;

  constructor(factory: IDBFactory) {
    this.db = new Promise((resolve, reject) => {
      const r = factory.open('timeflow-sync', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('outbox', { keyPath: 'key' });
        r.result.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  private async tx<T>(store: 'outbox' | 'meta', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req ? req.result : (undefined as T));
      t.onerror = () => reject(t.error);
    });
  }

  enqueue(items: OutboxItem[]) {
    return this.tx('outbox', 'readwrite', (s) => void items.forEach((i) => s.put(i)));
  }
  outbox() {
    return this.tx<OutboxItem[]>('outbox', 'readonly', (s) => s.getAll());
  }
  async ack(items: OutboxItem[]) {
    const db = await this.db;
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('outbox', 'readwrite');
      const s = t.objectStore('outbox');
      // Solo se borra si no ha cambiado mientras se subía.
      for (const i of items) {
        const g = s.get(i.key);
        g.onsuccess = () => g.result?.ts === i.ts && s.delete(i.key);
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }
  clearOutbox() {
    return this.tx('outbox', 'readwrite', (s) => s.clear());
  }
  async get(key: string): Promise<string | undefined> {
    const r = await this.tx<{ key: string; value: string } | undefined>('meta', 'readonly', (s) => s.get(key));
    return r?.value;
  }
  set(key: string, value: string | null) {
    return this.tx('meta', 'readwrite', (s) => {
      if (value === null) s.delete(key);
      else s.put({ key, value });
    });
  }
}

/* ---------- Servidor remoto (Firebase u otro): contrato mínimo ---------- */

export interface RemoteUser {
  id: string;
  email: string | null;
}

export interface RemoteBackend {
  currentUser(): Promise<RemoteUser | null>;
  onUserChange(cb: (u: RemoteUser | null) => void): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Filas del usuario posteriores al cursor, en orden de servidor. */
  fetch(uid: string, since?: string): Promise<RemoteRow[]>;
  upsert(uid: string, rows: { store: string; id: string; data: unknown; deleted: boolean }[]): Promise<void>;
}

/* ---------- Estado visible en la UI ---------- */

export interface SyncStatus {
  email: string | null;
  state: 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';
  lastSync?: string;
  pending: number;
  error?: string;
}

/** Cursor de "sincronizado desde el principio" cuando la nube estaba vacía. */
const START = '0';

const toItem = (op: Op): OutboxItem => {
  const id = op.type === 'put' ? recordId(op.store, op.value) : op.key;
  return {
    key: `${op.store}|${id}`,
    store: op.store,
    id,
    data: op.type === 'put' ? op.value : null,
    deleted: op.type === 'delete',
    ts: Date.now(),
  };
};

/**
 * Repositorio local-first: escribe en IndexedDB al instante y sincroniza con el servidor
 * en segundo plano (cola de pendientes + descarga incremental por cursor).
 */
export class SyncedRepository implements Repository {
  readonly kind = 'synced';
  private store: SyncStore;
  private user: RemoteUser | null = null;
  private dataListeners = new Set<() => void>();
  private statusListeners = new Set<(s: SyncStatus) => void>();
  private running: Promise<void> | null = null;
  private again = false;
  status: SyncStatus = { email: null, state: 'signed-out', pending: 0 };

  constructor(private local: Repository, private backend: RemoteBackend, factory: IDBFactory = indexedDB) {
    this.store = new SyncStore(factory);
  }

  /* --- Repository --- */

  loadAll() {
    return this.local.loadAll();
  }

  async apply(ops: Op[]) {
    if (this.user) await this.store.enqueue(ops.map(toItem));
    await this.local.apply(ops);
    if (this.user) this.schedule();
  }

  async replaceAll(s: Snapshot) {
    await this.local.replaceAll(s);
    if (!this.user) return;
    // Importación completa: la nube debe quedar igual que el dispositivo.
    const remote = await this.backend.fetch(this.user.id);
    const keep = new Set(snapshotOps(s).map((o) => toItem(o).key));
    const deletes: Op[] = remote
      .filter((r) => !r.deleted && !keep.has(`${r.store}|${r.id}`))
      .map((r) => ({ type: 'delete', store: r.store, key: r.id }) as Op);
    await this.store.enqueue([...snapshotOps(s), ...deletes].map(toItem));
    this.schedule();
  }

  subscribe(cb: () => void) {
    this.dataListeners.add(cb);
    return () => this.dataListeners.delete(cb);
  }

  /* --- Sesión --- */

  onStatus(cb: (s: SyncStatus) => void) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  private setStatus(p: Partial<SyncStatus>) {
    this.status = { ...this.status, ...p };
    this.statusListeners.forEach((l) => l(this.status));
  }

  async start() {
    this.setUser(await this.backend.currentUser());
    this.backend.onUserChange((u) => u?.id !== this.user?.id && this.setUser(u));
    if (typeof window === 'undefined') return;
    const kick = () => this.user && this.schedule();
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && kick());
    setInterval(() => document.visibilityState === 'visible' && kick(), 60_000);
  }

  private setUser(u: RemoteUser | null) {
    this.user = u;
    if (!u) return this.setStatus({ email: null, state: 'signed-out', pending: 0, error: undefined });
    this.setStatus({ email: u.email, state: 'syncing', error: undefined });
    this.schedule();
  }

  signIn(email: string, password: string) {
    return this.backend.signIn(email, password);
  }

  signUp(email: string, password: string) {
    return this.backend.signUp(email, password);
  }

  async signOut() {
    const uid = this.user?.id;
    await this.backend.signOut();
    this.setUser(null);
    if (uid) await this.store.set(`cursor:${uid}`, null);
    await this.store.clearOutbox();
  }

  /* --- Sincronización --- */

  schedule() {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.schedule();
      }
    });
  }

  /** Espera a que termine la sincronización en curso (tests y acciones manuales). */
  async flush() {
    this.schedule();
    while (this.running) await this.running;
  }

  private async run() {
    const uid = this.user?.id;
    if (!uid) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus({ state: 'offline', pending: (await this.store.outbox()).length });
      return;
    }
    this.setStatus({ state: 'syncing' });
    try {
      if (!(await this.store.get(`cursor:${uid}`))) await this.firstSync(uid);
      await this.push(uid);
      await this.pull(uid);
      this.setStatus({ state: 'synced', lastSync: new Date().toISOString(), pending: (await this.store.outbox()).length, error: undefined });
    } catch (e) {
      this.setStatus({ state: 'error', error: e instanceof Error ? e.message : String(e), pending: (await this.store.outbox()).length });
    }
  }

  private notify() {
    this.dataListeners.forEach((l) => l());
  }

  /** Primer inicio de sesión en este dispositivo. */
  private async firstSync(uid: string) {
    const rows = await this.backend.fetch(uid);
    const local = await this.local.loadAll();
    const live = rows.filter((r) => !r.deleted);
    if (local && !live.length) {
      await this.store.enqueue(snapshotOps(local).map(toItem));
    } else if (local) {
      const remote = rowsToSnapshot(live, local);
      const hasOwnData = local.entries.length > 0 || local.goals.length > 0;
      if (!hasOwnData) {
        await this.local.replaceAll(remote);
      } else {
        const { merged, push } = mergeIntoRemote(remote, local);
        await this.local.replaceAll(merged);
        await this.store.enqueue(push.map(toItem));
      }
      this.notify();
    }
    await this.store.set(`cursor:${uid}`, rows.length ? rows[rows.length - 1].cursor : START);
  }

  private async push(uid: string) {
    const items = await this.store.outbox();
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500);
      await this.backend.upsert(uid, chunk.map(({ store, id, data, deleted }) => ({ store, id, data, deleted })));
      await this.store.ack(chunk);
    }
  }

  private async pull(uid: string) {
    const cursor = await this.store.get(`cursor:${uid}`);
    const rows = await this.backend.fetch(uid, cursor === START ? undefined : cursor);
    if (!rows.length) return;
    const pending = new Set((await this.store.outbox()).map((i) => i.key));
    const ops = rowsToOps(rows.filter((r) => !pending.has(`${r.store}|${r.id}`)));
    if (ops.length) {
      await this.local.apply(ops);
      this.notify();
    }
    await this.store.set(`cursor:${uid}`, rows[rows.length - 1].cursor);
  }
}
