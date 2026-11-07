-- BiscuitFlow: display and calculate Egg / Eggs by weight (grams), not pieces.
-- Back up the database before running this query in Supabase SQL Editor.
-- IMPORTANT: 1 previously recorded egg ('pcs') is assumed to equal 50 g
-- of usable egg for migration purposes. Adjust the conversion constant
-- below to your actual recipe measurement BEFORE executing if needed.
-- This is a one-time data conversion. DO NOT rerun this migration.
begin;

do $migration$
declare
  v_grams_per_egg numeric := 50;
  v_egg record;
begin
  if v_grams_per_egg<=0 then raise exception 'Invalid egg weight'; end if;
  -- Convert existing recipe ingredient entries, keyed by owner and ingredient id.
  -- Do this BEFORE the stock unit conversion so legacy recipe pcs is recognizable.
  for v_egg in
    select owner_id,id from public.biscuit_stock
    where lower(btrim(name)) in ('egg','eggs') and unit='pcs'
  loop
    update public.biscuit_recipes r
    set ingredients=(
      select coalesce(jsonb_agg(
        case
          when part->>'ingredientId'=v_egg.id and part->>'unit'='pcs' then
            jsonb_set(
              jsonb_set(part,'{quantity}',to_jsonb((part->>'quantity')::numeric*v_grams_per_egg)),
              '{unit}',to_jsonb('g'::text)
            )
          else part
        end order by ord
      ),'[]'::jsonb)
      from jsonb_array_elements(coalesce(r.ingredients::jsonb,'[]'::jsonb)) with ordinality as p(part,ord)
    )
    where r.owner_id=v_egg.owner_id
      and exists(
        select 1 from jsonb_array_elements(coalesce(r.ingredients::jsonb,'[]'::jsonb)) p
        where p->>'ingredientId'=v_egg.id and p->>'unit'='pcs'
      );

    update public.biscuit_stock
    set quantity=quantity*v_grams_per_egg,
        minimum=minimum*v_grams_per_egg,
        unit='g'
    where owner_id=v_egg.owner_id and id=v_egg.id and unit='pcs';
  end loop;
end $migration$;

notify pgrst, 'reload schema';
commit;

-- After running, check Ingredient Inventory and each Egg recipe ingredient.
-- For example: 2 pcs becomes 100 g; 30 pcs stock becomes 1500 g.
