-- Run in the EXISTING BiscuitFlow Supabase project after taking a backup.
-- Run 20261026_cans_shopping.sql first if your database lacks cans_per_batch.
-- Replace the placeholder admin email in the INSERT statement before running.
-- This migration DOES NOT delete prior orders, recipes or inventory.
create table if not exists public.bakery_admins(
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.bakery_admins enable row level security;
revoke all on public.bakery_admins from anon, authenticated;
-- Set the ONLY authorized administrator, using the existing Supabase Auth user.
-- Replace the email below with the correct admin account before execution.
-- insert into public.bakery_admins(user_id)
-- select id from auth.users where email = 'REPLACE_WITH_ADMIN_EMAIL'
-- on conflict (user_id) do nothing;

create or replace function public.is_bakery_admin()
returns boolean language sql stable security definer set search_path=''
as $$select exists(select 1 from public.bakery_admins a where a.user_id=(select auth.uid()))$$;
revoke all on function public.is_bakery_admin() from public,anon;
grant execute on function public.is_bakery_admin() to authenticated;

alter table public.biscuit_recipes add column if not exists is_published boolean not null default false;
create table if not exists public.biscuit_guest_order_contacts(
 order_id text not null,
 owner_id uuid not null references auth.users(id) on delete cascade,
 phone text not null,
 email text not null,
 placed_at timestamptz not null default now(),
 primary key(owner_id,order_id),
 foreign key(owner_id,order_id) references public.biscuit_orders(owner_id,id) on delete cascade
);
alter table public.biscuit_guest_order_contacts enable row level security;
drop policy if exists admin_read_guest_contacts on public.biscuit_guest_order_contacts;
create policy admin_read_guest_contacts on public.biscuit_guest_order_contacts for select to authenticated
 using(owner_id=(select auth.uid()) and (select public.is_bakery_admin()));

-- Prevent non-admin authenticated accounts from managing any of the private operational tables.
drop policy if exists owners_manage_orders on public.biscuit_orders;
drop policy if exists owners_manage_recipes on public.biscuit_recipes;
drop policy if exists owners_manage_stock on public.biscuit_stock;
create policy owners_manage_orders on public.biscuit_orders for all to authenticated
 using(owner_id=(select auth.uid()) and (select public.is_bakery_admin()))
 with check(owner_id=(select auth.uid()) and (select public.is_bakery_admin()));
create policy owners_manage_recipes on public.biscuit_recipes for all to authenticated
 using(owner_id=(select auth.uid()) and (select public.is_bakery_admin()))
 with check(owner_id=(select auth.uid()) and (select public.is_bakery_admin()));
create policy owners_manage_stock on public.biscuit_stock for all to authenticated
 using(owner_id=(select auth.uid()) and (select public.is_bakery_admin()))
 with check(owner_id=(select auth.uid()) and (select public.is_bakery_admin()));
-- Shopping list policy may not exist if the previous migration has not been applied.
do $$begin
 if to_regclass('public.biscuit_shopping_items') is not null then
  execute 'drop policy if exists owners_manage_shopping on public.biscuit_shopping_items';
  execute 'create policy owners_manage_shopping on public.biscuit_shopping_items for all to authenticated using(owner_id=(select auth.uid()) and (select public.is_bakery_admin())) with check(owner_id=(select auth.uid()) and (select public.is_bakery_admin()))';
 end if;
end$$;

create or replace function public.guest_biscuit_catalog()
returns table(id text,name text)
language sql stable security definer set search_path=''
as $$
 select r.id,r.name from public.biscuit_recipes r
 where r.is_published and r.owner_id in (select a.user_id from public.bakery_admins a)
 order by r.name
 limit 100
$$;
revoke all on function public.guest_biscuit_catalog() from public;
grant execute on function public.guest_biscuit_catalog() to anon,authenticated;

create or replace function public.submit_guest_biscuit_order(
 p_name text,p_phone text,p_email text,p_due_date date,p_items jsonb)
returns text language plpgsql security definer set search_path=''
as $$
declare
 v_owner uuid;v_order_id text;v_item jsonb;v_recipe record;v_quantity numeric;
 v_count integer:=0;v_total integer:=0;v_order_items jsonb:='[]'::jsonb;
 v_names text[]:=array[]::text[];v_quantities text[]:=array[]::text[];v_seen text[]:=array[]::text[];
begin
 if p_name is null or length(btrim(p_name)) not between 2 and 100 or p_name ~ '[<>]' then raise exception 'Invalid customer name';end if;
 if p_phone is null or p_phone !~ '^[+0-9() -]{7,24}$' then raise exception 'Invalid phone number';end if;
 if p_email is null or length(p_email)>180 or p_email !~* '^[^ @]+@[^ @]+[.][^ @]+$' then raise exception 'Valid email is required';end if;
 if p_due_date is null or p_due_date<current_date or p_due_date>current_date+365 then raise exception 'Invalid delivery date';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 10 then raise exception 'Select 1 to 10 biscuit types';end if;
 select a.user_id into v_owner from public.bakery_admins a order by a.user_id limit 1;
 if v_owner is null then raise exception 'Store is not configured';end if;
 -- Per-contact abuse guard; additional edge/IP rate limiting and CAPTCHA recommended before public launch.
 if (select count(*) from public.biscuit_guest_order_contacts c where c.owner_id=v_owner and c.phone=p_phone and c.placed_at>now()-interval '1 hour')>=3 then
  raise exception 'Too many orders; please contact the bakery';
 end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_item)<>'object' then raise exception 'Invalid biscuit item';end if;
  if jsonb_typeof(v_item->'recipeId')<>'string' or jsonb_typeof(v_item->'cans')<>'number' then raise exception 'Invalid biscuit item';end if;
  if (v_item->>'cans') !~ '^[0-9]{1,3}$' then raise exception 'Cans must be whole numbers';end if;
  v_quantity:=(v_item->>'cans')::numeric;
  if v_quantity<1 or v_quantity>50 then raise exception 'Quantity must be 1 to 50 cans';end if;
  if (v_item->>'recipeId')=any(v_seen) then raise exception 'Duplicate biscuit type';end if;
  select r.id,r.name into v_recipe from public.biscuit_recipes r where r.id=v_item->>'recipeId' and r.owner_id=v_owner and r.is_published;
  if not found then raise exception 'Biscuit unavailable';end if;
  v_seen:=array_append(v_seen,v_recipe.id);
  v_total:=v_total+v_quantity::integer;
  v_count:=v_count+1;
  if v_total>100 then raise exception 'Maximum 100 cans per order';end if;
  v_names:=array_append(v_names,v_recipe.name);
  v_quantities:=array_append(v_quantities,v_recipe.name||': '||v_quantity::text||' can(s)');
  v_order_items:=v_order_items||jsonb_build_array(jsonb_build_object('recipeId',v_recipe.id,'cans',v_quantity::integer));
 end loop;
 v_order_id:='WEB-'||replace(gen_random_uuid()::text,'-','');
 insert into public.biscuit_orders(owner_id,id,customer,items,qty,date,status,method,shortage,order_items)
 values(v_owner,v_order_id,btrim(p_name),array_to_string(v_names,', '),array_to_string(v_quantities,' · '),
 to_char(p_due_date,'Mon DD, YYYY'),'Pending','Pickup',false,v_order_items);
 insert into public.biscuit_guest_order_contacts(owner_id,order_id,phone,email)
 values(v_owner,v_order_id,btrim(p_phone),lower(btrim(p_email)));
 return v_order_id;
end$$;
revoke all on function public.submit_guest_biscuit_order(text,text,text,date,jsonb) from public;
grant execute on function public.submit_guest_biscuit_order(text,text,text,date,jsonb) to anon,authenticated;
