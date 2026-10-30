import { IndexedDBRepository } from './indexeddb';
import { MemoryRepository } from './memory';
import type { Repository } from './repository';
import type { SyncedRepository } from './sync';
import { firebaseConfig } from './firebase-config';

export const syncAvailable = !!firebaseConfig;

let sync: SyncedRepository | null = null;
export const getSync = () => sync;

export async function createRepository(): Promise<Repository> {
  let local: Repository;
  try {
    if (typeof indexedDB === 'undefined') throw new Error('sin IndexedDB');
    const repo = new IndexedDBRepository();
    await repo.loadAll();
    navigator.storage?.persist?.().catch(() => undefined);
    local = repo;
  } catch {
    return new MemoryRepository();
  }
  if (!syncAvailable) return local;
  try {
    const [{ createFirebaseBackend }, { SyncedRepository }] = await Promise.all([import('./firebase'), import('./sync')]);
    sync = new SyncedRepository(local, createFirebaseBackend(firebaseConfig!));
    sync.start().catch(() => undefined);
    return sync;
  } catch {
    return local;
  }
}

export type { Op, Repository } from './repository';
export { applyOps } from './repository';
