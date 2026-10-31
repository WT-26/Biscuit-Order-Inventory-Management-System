-- Requires existing recipe, stock, baking events, and admin migrations.
-- Apply to existing shared Supabase project AFTER backup and testing.
-- One baking entry represents whole recipe batches: p_cans must be a multiple of cans_per_batch.
-- Ingredients are deducted atomically with the baking event.
create or replace function public.record_baked_cans(p_recipe_id text,p_cans integer,p_note text default '')
returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_id uuid; v_owner uuid:=auth.uid(); v_recipe public.biscuit_recipes%rowtype;
 v_batches integer; v_part jsonb; v_stock public.biscuit_stock%rowtype;
 v_needed numeric; v_factor numeric; v_stock_factor numeric;
begin
 if v_owner is null or not public.is_bakery_admin() then raise exception 'Admin access required';end if;
 if p_recipe_id is null or p_cans is null or p_cans<1 or p_cans>10000 then raise exception 'Enter 1 to 10000 whole cans';end if;
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

-- Receiving stock performs one serialized atomic increment, rather than overwriting stale quantities.
create or replace function public.receive_biscuit_ingredient(p_ingredient_id text,p_quantity numeric,p_unit text)
returns numeric language plpgsql security definer set search_path=''
as $$
declare v_owner uuid:=auth.uid();v_stock public.biscuit_stock%rowtype;v_scale numeric;v_unit_scale numeric;v_amount numeric;v_result numeric;
begin
 if v_owner is null or not public.is_bakery_admin() then raise exception 'Admin access required';end if;
 if p_ingredient_id is null or p_quantity is null or p_quantity<=0 or p_quantity>1000000 then raise exception 'Invalid quantity';end if;
 perform pg_advisory_xact_lock(hashtext(v_owner::text));
 select * into v_stock from public.biscuit_stock where id=p_ingredient_id and owner_id=v_owner for update;
 if not found then raise exception 'Unknown ingredient';end if;
 if p_unit in ('g','kg') and v_stock.unit in ('g','kg') then
   v_scale:=case when p_unit='kg' then 1000 else 1 end;
   v_unit_scale:=case when v_stock.unit='kg' then 1000 else 1 end;
 elsif p_unit in ('ml','L') and v_stock.unit in ('ml','L') then
   v_scale:=case when p_unit='L' then 1000 else 1 end;
   v_unit_scale:=case when v_stock.unit='L' then 1000 else 1 end;
 elsif p_unit='pcs' and v_stock.unit='pcs' then v_scale:=1;v_unit_scale:=1;
 else raise exception 'Incompatible units';end if;
 v_amount:=p_quantity*v_scale/v_unit_scale;
 update public.biscuit_stock set quantity=quantity+v_amount
 where owner_id=v_owner and id=p_ingredient_id returning quantity into v_result;
 return v_result;
end$$;
revoke all on function public.receive_biscuit_ingredient(text,numeric,text) from public,anon;
grant execute on function public.receive_biscuit_ingredient(text,numeric,text) to authenticated;
