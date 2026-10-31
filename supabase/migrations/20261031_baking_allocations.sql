-- Apply AFTER 20261031_baking_production.sql. Back up database first.
-- Allocations are consumed on Pending/In Progress -> Completed, released if reopened.
-- Completed orders already in the database are NOT retroactively allocated.
create table if not exists public.biscuit_baking_allocations (
 owner_id uuid not null references auth.users(id) on delete cascade,
 order_id text not null,
 recipe_id text not null,
 cans integer not null check(cans>0),
 allocated_at timestamptz not null default now(),
 primary key(owner_id,order_id,recipe_id),
 foreign key(owner_id,order_id) references public.biscuit_orders(owner_id,id) on delete cascade,
 foreign key(owner_id,recipe_id) references public.biscuit_recipes(owner_id,id) on delete restrict
);
alter table public.biscuit_baking_allocations enable row level security;
revoke all on public.biscuit_baking_allocations from anon;
grant select on public.biscuit_baking_allocations to authenticated;
drop policy if exists baking_allocations_admin_read on public.biscuit_baking_allocations;
create policy baking_allocations_admin_read on public.biscuit_baking_allocations
 for select to authenticated using(owner_id=(select auth.uid()) and (select public.is_bakery_admin()));

create or replace function public.allocate_baking_on_order_completion()
returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; v_recipe text; v_cans integer; v_required integer; v_produced bigint; v_consumed bigint;
begin
 if old.status=new.status then return new; end if;
 -- Serialize completion against other order updates from the same bakery.
 perform pg_advisory_xact_lock(hashtext(new.owner_id::text));
 if old.status='Completed' and new.status<>'Completed' then
  delete from public.biscuit_baking_allocations where owner_id=new.owner_id and order_id=new.id;
 end if;
 if new.status='Completed' and old.status<>'Completed' then
  for item in select value from jsonb_array_elements(coalesce(new.order_items,'[]'::jsonb)) loop
   v_recipe:=item->>'recipeId';
   if not (item ? 'cans') then
     raise exception 'Order has legacy piece quantities; update to cans before completing';
   end if;
   if (item->>'cans') !~ '^[0-9]+$' then raise exception 'Invalid can quantity in order'; end if;
   v_cans:=(item->>'cans')::integer;
   if v_cans<1 then raise exception 'Invalid can quantity'; end if;
   select coalesce(sum((elem->>'cans')::int),0) into v_required
   from jsonb_array_elements(new.order_items) elem where elem->>'recipeId'=v_recipe;
   if exists(select 1 from public.biscuit_baking_allocations where owner_id=new.owner_id and order_id=new.id and recipe_id=v_recipe) then continue;end if;
   select coalesce(sum(cans),0) into v_produced from public.biscuit_baking_events
    where owner_id=new.owner_id and recipe_id=v_recipe;
   select coalesce(sum(cans),0) into v_consumed from public.biscuit_baking_allocations
    where owner_id=new.owner_id and recipe_id=v_recipe;
   if v_produced-v_consumed<v_required then
    raise exception 'Not enough baked cans for recipe %: need %, available %',v_recipe,v_required,v_produced-v_consumed;
   end if;
   insert into public.biscuit_baking_allocations(owner_id,order_id,recipe_id,cans)
    values(new.owner_id,new.id,v_recipe,v_required);
  end loop;
 end if;
 return new;
end$$;
revoke all on function public.allocate_baking_on_order_completion() from public,anon,authenticated;
drop trigger if exists baking_allocation_on_status on public.biscuit_orders;
create trigger baking_allocation_on_status after update of status on public.biscuit_orders
 for each row execute function public.allocate_baking_on_order_completion();
