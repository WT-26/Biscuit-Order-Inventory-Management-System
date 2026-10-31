# Baked cans tracking — draft deployment

## Setup
1. Back up your existing shared Supabase database.
2. Apply `supabase/migrations/20261031_baking_production.sql` in **that same** Supabase project's SQL Editor.
3. Test the branch's Admin page as a Preview, then run `pnpm exec tsc --noEmit` and `pnpm build`.
4. Open **Admin → Production Planning → Record baked biscuits**. Choose a recipe, enter the number of cans baked, and optionally a note. It saves an append-only baking event to Supabase.
5. Production Planning now shows active-order demand, total recorded baked cans by biscuit, and cans still required. Notifications adds a baking-shortage entry for each biscuit with remaining active-order demand.
6. Reload admin to verify persistence. Test an unauthenticated user and an authenticated non-admin cannot read or record baking events, including by directly calling the RPC.

## Important accounting limitation before production use
Current tracking is **pooled by biscuit type, not assigned to a particular customer order**. It records all-time cans baked and compares that number with currently active orders. Baking events are never automatically consumed when orders are completed or delivered. This means old baking history may overstate availability for future orders. **Do not treat remaining counts as fulfillment-grade inventory until order allocation, dispatch/consumption, waste and adjustments are implemented.** This first version is a draft prototype for evaluating the interface and database workflow.

Recording baking does **not** deduct ingredient stock, consume cans for fulfilled orders, or change order statuses. Active order quantities can be adjusted by the existing admin Orders interface. Existing orders, recipes, stock and customer pages are unchanged.

## Suggested tests
- Pending orders: 2 peanut + 3 peanut cans; record 1 peanut can -> 4 remaining.
- Record 4 more -> 0 remaining.
- Check notification reflects updates and disappears when no active-order deficit.
- Confirm data survives page refresh and wrong-user access is rejected.
- Verify stock remains unchanged when logging production.
- Check what happens when an order becomes Completed or Cancelled; this is where the pooled-record design needs order allocation before real usage.
