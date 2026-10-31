-- Apply in the existing BiscuitFlow Supabase project after backup.
-- Append-only baking events; existing orders, recipes, and stock are unchanged.
create table if not exists public.biscuit_baking_events (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 recipe_id text not null,
 cans integer not null check (cans between 1 and 10000),
 baked_at timestamptz not null default now(),
 note text not null default '',
 foreign key(owner_id, recipe_id) references public.biscuit_recipes(owner_id,id) on delete restrict
);
create index if not exists biscuit_baking_events_owner_recipe on public.biscuit_baking_events(owner_id,recipe_id);
alter table public.biscuit_baking_events enable row level security;
revoke all on public.biscuit_baking_events from anon;
grant select on public.biscuit_baking_events to authenticated;
drop policy if exists admin_read_baking_events on public.biscuit_baking_events;
create policy admin_read_baking_events on public.biscuit_baking_events for select to authenticated
 using(owner_id=(select auth.uid()) and (select public.is_bakery_admin()));

-- Validate against trusted auth, not a client-supplied owner.
-- RPC executes atomically and records a permanent production event.
create or replace function public.record_baked_cans(p_recipe_id text,p_cans integer,p_note text default '')
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if not public.is_bakery_admin() then raise exception 'Admin access required'; end if;
 if p_recipe_id is null or p_cans is null or p_cans < 1 or p_cans > 10000 then
   raise exception 'Enter 1 to 10000 whole cans';
 end if;
 if length(coalesce(p_note,'')) > 250 then raise exception 'Note is too long'; end if;
 if not exists(select 1 from public.biscuit_recipes where id=p_recipe_id and owner_id=(select auth.uid())) then
   raise exception 'Unknown biscuit recipe';
 end if;
 insert into public.biscuit_baking_events(owner_id,recipe_id,cans,note)
 values((select auth.uid()),p_recipe_id,p_cans,coalesce(p_note,'')) returning id into v_id;
 return v_id;
end$$;
revoke all on function public.record_baked_cans(text,integer,text) from public,anon;
grant execute on function public.record_baked_cans(text,integer,text) to authenticated;
