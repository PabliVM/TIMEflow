-- TIMEFLOW · esquema de sincronización.
-- Pegar en Supabase › SQL Editor › Run. Se puede ejecutar varias veces sin romper nada.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, store, id)
);

create index if not exists records_user_updated on public.records (user_id, updated_at);

create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.records_touch();

alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
drop policy if exists "records_insert_own" on public.records;
drop policy if exists "records_update_own" on public.records;
drop policy if exists "records_delete_own" on public.records;

create policy "records_select_own" on public.records for select using (auth.uid() = user_id);
create policy "records_insert_own" on public.records for insert with check (auth.uid() = user_id);
create policy "records_update_own" on public.records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "records_delete_own" on public.records for delete using (auth.uid() = user_id);
