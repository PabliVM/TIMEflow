import { IndexedDBRepository } from './indexeddb';
import { MemoryRepository } from './memory';
import type { Repository } from './repository';
import type { SyncedRepository } from './sync';

// Referencias literales: Next.js las sustituye en el build.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const syncAvailable = !!(SUPABASE_URL && SUPABASE_KEY);

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
    const [{ createClient }, { SyncedRepository }] = await Promise.all([import('@supabase/supabase-js'), import('./sync')]);
    sync = new SyncedRepository(local, createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: true, autoRefreshToken: true } }));
    sync.start().catch(() => undefined);
    return sync;
  } catch {
    return local;
  }
}

export type { Op, Repository } from './repository';
export { applyOps } from './repository';
