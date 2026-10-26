-- BiscuitFlow: Run once in Supabase SQL Editor before using manual shopping list.
-- This migration preserves existing order, recipe and stock rows.
alter table public.biscuit_recipes add column if not exists cans_per_batch integer not null default 1 check (cans_per_batch > 0);
create table if not exists public.biscuit_shopping_items (
  id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  ingredient_id text not null,
  requested_quantity numeric not null check (requested_quantity > 0),
  unit text not null check (unit in ('g','kg','ml','L','pcs')),
  created_at timestamptz not null default now(),
  primary key(owner_id,id)
);
alter table public.biscuit_shopping_items enable row level security;
drop policy if exists "owners_manage_shopping" on public.biscuit_shopping_items;
create policy "owners_manage_shopping" on public.biscuit_shopping_items for all to authenticated
 using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create index if not exists idx_biscuit_shopping_owner on public.biscuit_shopping_items(owner_id);
