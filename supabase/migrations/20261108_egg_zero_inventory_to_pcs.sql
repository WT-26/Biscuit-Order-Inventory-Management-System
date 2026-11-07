-- BiscuitFlow: safely switch an EMPTY Eggs inventory row from grams to pieces.
-- Run this in the existing Supabase project after backing up your data.
-- Only rows named Egg / Eggs whose stock AND minimum are zero are changed.
-- No numerical conversion is guessed and no recipe quantities are modified.
-- If the egg stock is nonzero, update it manually after checking real egg counts.

begin;

do $$
declare
  v_nonzero_count integer;
begin
  select count(*) into v_nonzero_count
  from public.biscuit_stock
  where lower(btrim(name)) in ('egg','eggs')
    and unit in ('g','kg')
    and (quantity <> 0 or minimum <> 0);
  if v_nonzero_count > 0 then
    raise exception 'Egg stock or minimum is not zero. Please verify actual egg counts before converting g/kg to pcs.';
  end if;
end $$;

update public.biscuit_stock
set unit='pcs'
where lower(btrim(name)) in ('egg','eggs')
  and unit in ('g','kg')
  and quantity=0
  and minimum=0;

notify pgrst, 'reload schema';
commit;

-- Verify the result. Existing recipes that refer to Eggs in grams must
-- be updated in Biscuit Recipes to pcs with the correct count per batch.
select name, quantity, minimum, unit
from public.biscuit_stock
where lower(btrim(name)) in ('egg','eggs');
