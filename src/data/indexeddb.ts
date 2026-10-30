import { SCHEMA_VERSION } from '@/domain/types';
import type { Snapshot } from '@/domain/types';
import { STORE_NAMES } from './repository';
import type { Op, Repository, StoreName } from './repository';

const DB_NAME = 'timeflow';
const DB_VERSION = 1;

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transacción cancelada'));
  });

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const name of STORE_NAMES) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: name === 'timer' ? 'entryId' : 'id' });
        if (name === 'entries') store.createIndex('date', 'date');
        if (name === 'entrySubactivities') store.createIndex('entryId', 'entryId');
        if (name === 'goalLinks') store.createIndex('goalId', 'goalId');
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Base de datos bloqueada por otra pestaña'));
  });
}

export class IndexedDBRepository implements Repository {
  readonly kind = 'indexeddb';
  private db: Promise<IDBDatabase>;

  constructor(factory: IDBFactory = indexedDB) {
    this.db = open(factory);
  }

  async loadAll(): Promise<Snapshot | null> {
    const db = await this.db;
    const tx = db.transaction(STORE_NAMES, 'readonly');
    const all = await Promise.all(STORE_NAMES.map((n) => req(tx.objectStore(n).getAll())));
    const by = Object.fromEntries(STORE_NAMES.map((n, i) => [n, all[i]])) as Record<StoreName, unknown[]>;
    const settings = by.settings[0] as Snapshot['settings'] | undefined;
    if (!settings) return null;
    return {
      schemaVersion: SCHEMA_VERSION,
      categories: by.categories as Snapshot['categories'],
      activities: by.activities as Snapshot['activities'],
      subactivities: by.subactivities as Snapshot['subactivities'],
      entries: by.entries as Snapshot['entries'],
      entrySubactivities: by.entrySubactivities as Snapshot['entrySubactivities'],
      goals: by.goals as Snapshot['goals'],
      goalLinks: by.goalLinks as Snapshot['goalLinks'],
      settings,
      timer: (by.timer[0] as Snapshot['timer']) ?? null,
    };
  }

  async apply(ops: Op[]): Promise<void> {
    if (!ops.length) return;
    const db = await this.db;
    const stores = [...new Set(ops.map((o) => o.store))];
    const tx = db.transaction(stores, 'readwrite');
    for (const op of ops) {
      const st = tx.objectStore(op.store);
      if (op.type === 'put') st.put(op.value);
      else st.delete(op.key);
    }
    await done(tx);
  }

  async replaceAll(s: Snapshot): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(STORE_NAMES, 'readwrite');
    for (const name of STORE_NAMES) {
      const st = tx.objectStore(name);
      st.clear();
      const values: unknown[] =
        name === 'settings' ? [s.settings] : name === 'timer' ? (s.timer ? [s.timer] : []) : (s[name] as unknown[]);
      for (const v of values) st.put(v);
    }
    await done(tx);
  }
}

