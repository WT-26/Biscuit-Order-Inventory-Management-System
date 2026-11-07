-- BiscuitFlow: fractional cans per batch + safe ingredient removal.
-- Backup first. Run AFTER 20261101_atomic_batch_inventory.sql in the SAME Supabase project.
-- Recipe yield of 2.5 cans permits recording 2.5 cans (1 batch) or 5 cans (2 batches).
-- Existing ingredient stock, orders, recipes and baking history are preserved.

alter table public.biscuit_recipes
  alter column cans_per_batch type numeric(12,2) using cans_per_batch::numeric(12,2);

alter table public.biscuit_baking_events
  alter column cans type numeric(12,2) using cans::numeric(12,2);

alter table public.biscuit_baking_events
  drop constraint if exists biscuit_baking_events_cans_check;
alter table public.biscuit_baking_events
  add constraint biscuit_baking_events_cans_check check(cans>0 and cans<=10000);

-- Replace the prior integer-only RPC signature, avoiding PostgreSQL function overloading ambiguity.
drop function if exists public.record_baked_cans(text,integer,text);
create or replace function public.record_baked_cans(p_recipe_id text,p_cans numeric,p_note text default '')
returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_id uuid; v_owner uuid:=auth.uid(); v_recipe public.biscuit_recipes%rowtype;
 v_batches integer; v_part jsonb; v_stock public.biscuit_stock%rowtype;
 v_needed numeric; v_factor numeric; v_stock_factor numeric;
begin
 if v_owner is null or not public.is_bakery_admin() then raise exception 'Admin access required';end if;
 if p_recipe_id is null or p_cans is null or p_cans<=0 or p_cans>10000 or p_cans<>round(p_cans,2) then raise exception 'Enter a positive can count with up to 2 decimals';end if;
 if length(coalesce(p_note,''))>250 then raise exception 'Note too long';end if;
 -- Lock recipe, and serialize production & receiving transactions for this bakery.
 perform pg_advisory_xact_lock(hashtext(v_owner::text));
 select * into v_recipe from public.biscuit_recipes where owner_id=v_owner and id=p_recipe_id for update;
 if not found then raise exception 'Recipe not found';end if;
 if v_recipe.cans_per_batch is null or v_recipe.cans_per_batch<1 then raise exception 'Invalid cans per batch';end if;
 if p_cans%v_recipe.cans_per_batch<>0 then raise exception 'Record full batches only: cans must be a multiple of %',v_recipe.cans_per_batch;end if;
 v_batches:=p_cans/v_recipe.cans_per_batch;
 if jsonb_typeof(v_recipe.ingredients::jsonb)<>'array' or jsonb_array_length(v_recipe.ingredients::jsonb)=0 then raise exception 'Recipe ingredients are missing';end if;
 for v_part in select value from jsonb_array_elements(v_recipe.ingredients::jsonb) loop
   select * into v_stock from public.biscuit_stock
    where owner_id=v_owner and id=v_part->>'ingredientId' for update;
   if not found then raise exception 'Ingredient not in inventory: %',v_part->>'ingredientId';end if;
   if (v_part->>'quantity') is null or (v_part->>'quantity')::numeric<=0 then raise exception 'Invalid recipe ingredient amount';end if;
   if (v_part->>'unit') in ('g','kg') and v_stock.unit in ('g','kg') then
     v_factor:=case when v_part->>'unit'='kg' then 1000 else 1 end;
     v_stock_factor:=case when v_stock.unit='kg' then 1000 else 1 end;
   elsif (v_part->>'unit') in ('ml','L') and v_stock.unit in ('ml','L') then
     v_factor:=case when v_part->>'unit'='L' then 1000 else 1 end;
     v_stock_factor:=case when v_stock.unit='L' then 1000 else 1 end;
   elsif v_part->>'unit'='pcs' and v_stock.unit='pcs' then
     v_factor:=1; v_stock_factor:=1;
   else raise exception 'Incompatible units for %',v_stock.name;end if;
   v_needed:=((v_part->>'quantity')::numeric*v_batches*v_factor)/v_stock_factor;
   update public.biscuit_stock set quantity=quantity-v_needed
     where owner_id=v_owner and id=v_stock.id and quantity>=v_needed;
   if not found then raise exception 'Insufficient %: need % %, available % %',v_stock.name,v_needed,v_stock.unit,v_stock.quantity,v_stock.unit;end if;
 end loop;
 insert into public.biscuit_baking_events(owner_id,recipe_id,cans,note)
 values(v_owner,p_recipe_id,p_cans,coalesce(p_note,'')) returning id into v_id;
 return v_id;
end$$;
revoke all on function public.record_baked_cans(text,integer,text) from public,anon;
grant execute on function public.record_baked_cans(text,integer,text) to authenticated;


-- The existing completion trigger must preserve fractional unallocated totals.
create or replace function public.allocate_baking_on_order_completion()
returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; v_recipe text; v_cans integer; v_required integer; v_produced numeric; v_consumed numeric;
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

-- Only admins may delete stock records, and never when in use by recipes or shopping items.
create or replace function public.delete_biscuit_ingredient(p_ingredient_id text)
returns void language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
 if v_owner is null or not public.is_bakery_admin() then raise exception 'Admin access required';end if;
 if p_ingredient_id is null or btrim(p_ingredient_id)='' then raise exception 'Ingredient is required';end if;
 perform pg_advisory_xact_lock(hashtext(v_owner::text));
 if exists (
   select 1 from public.biscuit_recipes r,
   lateral jsonb_array_elements(coalesce(r.ingredients::jsonb,'[]'::jsonb)) part
   where r.owner_id=v_owner and part->>'ingredientId'=p_ingredient_id
 ) then raise exception 'This ingredient is used in a biscuit recipe. Remove it from the recipe first.';end if;
 if exists(select 1 from public.biscuit_shopping_items s where s.owner_id=v_owner and s.ingredient_id=p_ingredient_id) then
   raise exception 'This ingredient is in the shopping list. Remove that shopping item first.';
 end if;
 delete from public.biscuit_stock s where s.owner_id=v_owner and s.id=p_ingredient_id;
 if not found then raise exception 'Ingredient not found';end if;
end$$;
revoke all on function public.delete_biscuit_ingredient(text) from public,anon;
grant execute on function public.delete_biscuit_ingredient(text) to authenticated;
notify pgrst, 'reload schema';
