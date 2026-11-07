-- BiscuitFlow: restore Egg / Eggs inventory and recipes to pieces (pcs).
-- Back up your database and CHECK the conversion factor before running.
-- The earlier eggs-to-grams migration assumed 1 egg = 50 g.
-- If you have since entered actual egg weights in grams, verify the appropriate
-- factor and reconcile stock before applying; this cannot infer real egg counts.
-- Safe to run if eggs were never converted: existing pcs values are unchanged.
-- Designed to be idempotent after successful conversion.

begin;
do $conversion$
declare
  v_grams_per_egg numeric := 50; -- REVIEW BEFORE RUNNING
  v_egg record;
begin
  if v_grams_per_egg <= 0 then
    raise exception 'Egg weight conversion must be greater than zero';
  end if;

  for v_egg in
    select owner_id,id,name,unit from public.biscuit_stock
    where lower(btrim(name)) in ('egg','eggs')
  loop
    if v_egg.unit not in ('g','kg','pcs') then
      raise exception 'Unsupported existing unit for %: %',v_egg.name,v_egg.unit;
    end if;

    -- Convert recipe ingredient amounts from grams/kilograms to pieces;
    -- preserve anything that is already in pcs.
    update public.biscuit_recipes r
    set ingredients=(
      select coalesce(jsonb_agg(
        case
          when part->>'ingredientId'=v_egg.id and part->>'unit' in ('g','kg') then
            jsonb_set(
              jsonb_set(part,'{quantity}',to_jsonb(
                ((part->>'quantity')::numeric *
                  case when part->>'unit'='kg' then 1000 else 1 end)
                / v_grams_per_egg)),
              '{unit}',to_jsonb('pcs'::text))
          else part
        end order by ord
      ),'[]'::jsonb)
      from jsonb_array_elements(coalesce(r.ingredients::jsonb,'[]'::jsonb))
        with ordinality as p(part,ord)
    )
    where r.owner_id=v_egg.owner_id
      and exists(
        select 1
        from jsonb_array_elements(coalesce(r.ingredients::jsonb,'[]'::jsonb)) p
        where p->>'ingredientId'=v_egg.id
          and p->>'unit' in ('g','kg')
      );

    if v_egg.unit in ('g','kg') then
      update public.biscuit_stock
      set quantity=quantity * (case when v_egg.unit='kg' then 1000 else 1 end) / v_grams_per_egg,
          minimum=minimum * (case when v_egg.unit='kg' then 1000 else 1 end) / v_grams_per_egg,
          unit='pcs'
      where owner_id=v_egg.owner_id and id=v_egg.id;
    end if;
  end loop;
end $conversion$;
notify pgrst, 'reload schema';
commit;

-- Verify in Ingredient Inventory and Biscuit Recipes:
-- 100 g egg per batch -> 2 pcs, 1500 g stock -> 30 pcs (at 50 g / egg).
