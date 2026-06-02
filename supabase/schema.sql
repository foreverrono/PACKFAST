-- PackFast TMS — Supabase schema (Postgres + RLS + Realtime)
-- Run once in the Supabase dashboard → SQL Editor → New query → paste → Run.
-- Idempotent: safe to re-run.
--
-- Design: one row per record. Each business table is { id text PK, data jsonb,
-- generated query columns, updated_at }. The full record object lives in `data`
-- (so nothing is ever lost and the app keeps its in-memory shape); a few columns
-- are GENERATED from `data` for indexing/filtering. Concurrent edits to different
-- rows never collide — that's the per-record win over the single JSON blob.

-- ── updated_at trigger ───────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ── Helper to (re)create a standard business table ───────────────────────
-- loads
create table if not exists public.loads (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  status   text    generated always as (data->>'status')  stored,
  customer text    generated always as (data->>'customer') stored,
  past     boolean generated always as ((data->>'past')::boolean) stored,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists loads_status_idx   on public.loads(status);
create index if not exists loads_past_idx      on public.loads(past);
create index if not exists loads_customer_idx  on public.loads(customer);
create index if not exists loads_updated_idx   on public.loads(updated_at desc);

-- locations (the directory)
create table if not exists public.locations (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  name    text generated always as (data->>'name')    stored,
  address text generated always as (data->>'address') stored,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists locations_name_idx on public.locations(name);

-- customers
create table if not exists public.customers (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  name    text generated always as (data->>'name')    stored,
  company text generated always as (data->>'company') stored,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists customers_name_idx on public.customers(name);

-- drivers
create table if not exists public.drivers (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  name text generated always as (data->>'name') stored,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- equipment
create table if not exists public.equipment (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  category text generated always as (data->>'category') stored,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- carriers
create table if not exists public.carriers (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- owner_operators
create table if not exists public.owner_operators (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- invoices (client invoices)
create table if not exists public.invoices (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  load_id text generated always as (data->>'loadId') stored,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- load_board (posted loads + bids)
create table if not exists public.load_board (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- org_settings (single shared row: load_seq, pay rates, expense defaults, currency default, week-paid maps, finances)
create table if not exists public.org_settings (
  id text primary key default 'singleton',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.org_settings (id, data) values ('singleton','{}'::jsonb)
  on conflict (id) do nothing;

-- profiles (one per auth user; role/access)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role text not null default 'dispatcher',   -- superadmin | admin | dispatcher | driver | client
  access jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── updated_at triggers on every business table ──────────────────────────
do $$
declare t text;
begin
  foreach t in array array['loads','locations','customers','drivers','equipment','carriers','owner_operators','invoices','load_board','org_settings']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ── Auto-create a profile when a user signs up ───────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row-Level Security ───────────────────────────────────────────────────
-- Shared business dataset: any authenticated user can read/write. (Role-based
-- narrowing — e.g. drivers see only assigned loads — can be layered later.)
do $$
declare t text;
begin
  foreach t in array array['loads','locations','customers','drivers','equipment','carriers','owner_operators','invoices','load_board','org_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists auth_all on public.%I', t);
    execute format($f$create policy auth_all on public.%I
        for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)$f$, t);
  end loop;
end $$;

-- profiles: everyone authenticated can read (for assignment dropdowns); a user can update their own row
alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (auth.uid() is not null);
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ── Realtime: publish changes on the business tables ─────────────────────
do $$
declare t text;
begin
  foreach t in array array['loads','locations','customers','drivers','equipment','carriers','owner_operators','invoices','load_board','org_settings']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
