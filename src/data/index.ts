import { IndexedDBRepository } from './indexeddb';
import { MemoryRepository } from './memory';
import type { Repository } from './repository';

export async function createRepository(): Promise<Repository> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('sin IndexedDB');
    const repo = new IndexedDBRepository();
    await repo.loadAll();
    navigator.storage?.persist?.().catch(() => undefined);
    return repo;
  } catch {
    return new MemoryRepository();
  }
}

export type { Op, Repository } from './repository';
export { applyOps } from './repository';
