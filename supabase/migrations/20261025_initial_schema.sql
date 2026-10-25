-- Run in Supabase SQL Editor. Private per-user data; no anonymous public access.
create table if not exists public.biscuit_orders (
  id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  customer text not null,
  items text not null default '',
  qty text not null default '',
  date text not null,
  status text not null check (status in ('Pending','In Progress','Completed','Cancelled')),
  method text not null default 'Pickup',
  shortage boolean not null default false,
  order_items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_id,id)
);
create table if not exists public.biscuit_recipes (
  id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  yield_pieces numeric not null check (yield_pieces > 0),
  ingredients jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_id,id)
);
create table if not exists public.biscuit_stock (
  id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  quantity numeric not null check (quantity >= 0),
  minimum numeric not null default 0 check (minimum >= 0),
  unit text not null check (unit in ('g','kg','ml','L','pcs')),
  updated_at timestamptz not null default now(),
  primary key (owner_id,id)
);
alter table public.biscuit_orders enable row level security;
alter table public.biscuit_recipes enable row level security;
alter table public.biscuit_stock enable row level security;
drop policy if exists "owners_manage_orders" on public.biscuit_orders;
drop policy if exists "owners_manage_recipes" on public.biscuit_recipes;
drop policy if exists "owners_manage_stock" on public.biscuit_stock;
create policy "owners_manage_orders" on public.biscuit_orders for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owners_manage_recipes" on public.biscuit_recipes for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owners_manage_stock" on public.biscuit_stock for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create index if not exists idx_biscuit_orders_owner_date on public.biscuit_orders(owner_id,date);
create index if not exists idx_biscuit_recipes_owner on public.biscuit_recipes(owner_id);
create index if not exists idx_biscuit_stock_owner on public.biscuit_stock(owner_id);
