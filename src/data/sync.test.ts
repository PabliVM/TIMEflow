import { IDBFactory } from 'fake-indexeddb';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSeed } from '../domain/seed';
import type { TimeEntry } from '../domain/types';
import { IndexedDBRepository } from './indexeddb';
import type { RemoteRow } from './merge';
import { SyncedRepository } from './sync';

type Row = RemoteRow & { user_id: string };

/** Servidor Supabase mínimo en memoria (tabla records con RLS por usuario). */
function fakeServer() {
  const rows = new Map<string, Row>();
  let clock = 0;
  const client = (uid: string) =>
    ({
      auth: {
        getSession: async () => ({ data: { session: { user: { id: uid, email: `${uid}@x.es` } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
      },
      from: () => ({
        select() {
          const q = {
            gtv: undefined as string | undefined, a: 0, b: 999,
            order: () => q,
            range: (a: number, b: number) => ((q.a = a), (q.b = b), q),
            gt: (_c: string, v: string) => ((q.gtv = v), q),
            then(res: (v: { data: Row[]; error: null }) => void) {
              const list = [...rows.values()]
                .filter((r) => r.user_id === uid && (!q.gtv || r.updated_at > q.gtv))
                .sort((x, y) => x.updated_at.localeCompare(y.updated_at));
              res({ data: list.slice(q.a, q.b + 1), error: null });
            },
          };
          return q;
        },
        async upsert(list: Omit<Row, 'updated_at'>[]) {
          for (const r of list) {
            clock += 1;
            rows.set(`${r.user_id}|${r.store}|${r.id}`, { ...r, updated_at: new Date(Date.UTC(2026, 0, 1) + clock * 1000).toISOString() });
          }
          return { error: null };
        },
      }),
    }) as unknown as SupabaseClient;
  return { rows, client };
}

async function device(server: ReturnType<typeof fakeServer>, uid: string) {
  const factory = new IDBFactory();
  const local = new IndexedDBRepository(factory);
  if (!(await local.loadAll())) await local.replaceAll(buildSeed());
  const repo = new SyncedRepository(local, server.client(uid), factory);
  await repo.start();
  await repo.flush();
  return repo;
}

const entry = (categoryId: string, id: string): TimeEntry => ({
  id, date: '2026-10-30', categoryId, durationSeconds: 1800, method: 'duration', timeZone: 'UTC', notes: '', createdAt: 'x', updatedAt: 'x',
});

test('sincroniza entre dos dispositivos sin duplicar categorías', async () => {
  const server = fakeServer();
  const a = await device(server, 'u1');
  const sa = (await a.loadAll())!;
  await a.apply([{ type: 'put', store: 'entries', value: entry(sa.categories[0].id, 'e-a') }]);
  await a.flush();

  const b = await device(server, 'u1');
  const sb = (await b.loadAll())!;
  assert.equal(sb.entries.length, 1, 'B recibe el registro de A');
  assert.deepEqual(sb.categories.map((c) => c.id).sort(), sa.categories.map((c) => c.id).sort(), 'B adopta las categorías de A');

  await b.apply([{ type: 'put', store: 'entries', value: entry(sb.categories[1].id, 'e-b') }]);
  await b.flush();
  await a.flush();
  assert.equal((await a.loadAll())!.entries.length, 2, 'A recibe el registro de B');

  await a.apply([{ type: 'delete', store: 'entries', key: 'e-b' }]);
  await a.flush();
  await b.flush();
  assert.deepEqual((await b.loadAll())!.entries.map((e) => e.id), ['e-a'], 'el borrado llega a B');
});

test('primer inicio con datos propios en ambos lados: combina por nombre', async () => {
  const server = fakeServer();
  const a = await device(server, 'u2');
  const factory = new IDBFactory();
  const local = new IndexedDBRepository(factory);
  const seed = buildSeed();
  seed.entries.push(entry(seed.categories[0].id, 'e-local'));
  await local.replaceAll(seed);
  const b = new SyncedRepository(local, server.client('u2'), factory);
  await b.start();
  await b.flush();
  const sb = (await b.loadAll())!;
  const sa = (await a.loadAll())!;
  assert.equal(sb.categories.length, sa.categories.length, 'sin categorías duplicadas');
  const e = sb.entries.find((x) => x.id === 'e-local')!;
  assert.equal(e.categoryId, sa.categories.find((c) => c.name === seed.categories[0].name)!.id, 'registro reasignado a la categoría remota');
  await a.flush();
  assert.equal((await a.loadAll())!.entries.length, 1, 'A recibe el registro combinado');
  assert.ok([...server.rows.values()].every((r) => r.user_id === 'u2'));
});
