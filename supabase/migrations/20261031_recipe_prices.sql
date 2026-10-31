-- Apply to the EXISTING Supabase project after backup. No existing data is deleted.
-- Existing orders keep NULL totals; only future guest orders store a checked price.
alter table public.biscuit_recipes
 add column if not exists price_per_can numeric(10,2) not null default 0
 check (price_per_can >= 0);
alter table public.biscuit_orders
 add column if not exists total_price numeric(12,2)
 check (total_price >= 0);

create or replace function public.guest_biscuit_catalog()
returns table(id text,name text,price_per_can numeric)
language sql stable security definer set search_path=''
as $$
 select r.id,r.name,r.price_per_can from public.biscuit_recipes r
 where r.is_published and r.price_per_can > 0
 and r.owner_id in (select a.user_id from public.bakery_admins a)
 order by r.name limit 100
$$;
revoke all on function public.guest_biscuit_catalog() from public;
grant execute on function public.guest_biscuit_catalog() to anon,authenticated;

create or replace function public.submit_guest_biscuit_order(
 p_name text,p_phone text,p_email text,p_due_date date,p_items jsonb)
returns text language plpgsql security definer set search_path=''
as $$
declare
 v_owner uuid;v_order_id text;v_item jsonb;v_recipe record;v_quantity numeric;v_order_total numeric(10,2):=0;
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
  select r.id,r.name into v_recipe from public.biscuit_recipes r where r.id=v_item->>'recipeId' and r.owner_id=v_owner and r.is_published and r.price_per_can>0;
  if not found then raise exception 'Biscuit unavailable';end if;
  v_seen:=array_append(v_seen,v_recipe.id);
  v_total:=v_total+v_quantity::integer;
  v_order_total:=v_order_total+(v_quantity*v_recipe.price_per_can);
  v_count:=v_count+1;
  if v_total>100 then raise exception 'Maximum 100 cans per order';end if;
  v_names:=array_append(v_names,v_recipe.name);
  v_quantities:=array_append(v_quantities,v_recipe.name||': '||v_quantity::text||' can(s)');
  v_order_items:=v_order_items||jsonb_build_array(jsonb_build_object('recipeId',v_recipe.id,'cans',v_quantity::integer));
 end loop;
 v_order_id:='WEB-'||replace(gen_random_uuid()::text,'-','');
 insert into public.biscuit_orders(owner_id,id,customer,items,qty,date,status,method,shortage,order_items,total_price)
 values(v_owner,v_order_id,btrim(p_name),array_to_string(v_names,', '),array_to_string(v_quantities,' · '),
 to_char(p_due_date,'Mon DD, YYYY'),'Pending','Pickup',false,v_order_items,v_order_total);
 insert into public.biscuit_guest_order_contacts(owner_id,order_id,phone,email)
 values(v_owner,v_order_id,btrim(p_phone),lower(btrim(p_email)));
 return v_order_id;
end$$;

-- Guests can retrieve only the price of a specific receipt whose random id they know.
create or replace function public.guest_order_total(p_order_id text)
returns numeric language sql stable security definer set search_path=''
as $$
 select o.total_price from public.biscuit_orders o
 where o.id=p_order_id and o.id like 'WEB-%'
 and o.owner_id in(select a.user_id from public.bakery_admins a)
 limit 1
$$;
revoke all on function public.guest_order_total(text) from public;
grant execute on function public.guest_order_total(text) to anon,authenticated;
