# Baked-can tracking and order fulfillment — test branch

## How it works
- An admin logs baked biscuit cans in **Production Planning**. Each entry is stored permanently in `biscuit_baking_events` as an audit record, not deleted when it is used.
- **Available baked cans** = total recorded baked cans − cans allocated to completed orders.
- **Still needed** = max(0, active-order demand − available baked cans), separately for every recipe.
- New Pending/In Progress orders raise demand. A Completed order is excluded from active demand, and its requested cans are **allocated/consumed** from available baked cans by a database trigger.
- If a completed order is reopened to Pending or In Progress, its allocation is released, returning its cans to available stock. Cancelled orders are excluded from demand.
- The Notifications page shows biscuit types with an outstanding number of cans.
- This does not automatically change ingredient quantities, order statuses or baked history, and does not assign a particular baking event to a particular order; it tracks the pooled stock of baked cans by biscuit type.

## Setup — IMPORTANT
1. Back up the existing shared Supabase project before running SQL.
2. Apply the following two migrations **in order** in the Supabase SQL Editor:
   - `supabase/migrations/20261031_baking_production.sql`
   - `supabase/migrations/20261031_baking_allocations.sql`
3. These migrations do not intentionally delete past orders, recipe entries or stock. Existing orders already marked Completed are not retroactively allocated.
4. Run `pnpm exec tsc --noEmit` and `pnpm build` and test with an Admin preview of this branch.
5. Do not merge before build, DB and RLS checks pass. The repo's Next config currently ignores TypeScript build errors.

## Example
- Pending peanut biscuit order A = 3 cans and Pending order B = 2 cans; active demand = 5.
- Record 4 peanut biscuit cans as baked. Remaining = 1; alert shows 1.
- Add a new Pending order of 2 cans. Active demand = 7; remaining = 3.
- Bake 3 more cans. Available = 7; remaining = 0.
- Mark order A (3 cans) Completed: the trigger allocates 3 cans, available drops to 4, active demand drops to 4, remaining stays 0.
- Add another order of 2 cans: active demand 6, available 4, remaining 2.
- If completed order A is reopened, its 3-can allocation returns, and its demand also becomes active again.

## Completion safety
- Completion checks baked stock in an atomic database transaction. If insufficient baked cans exist, the database rejects marking the order Completed.
- The UI currently uses optimistic order-status updates. If a completion is rejected, refresh the Admin dashboard to recover the persisted status.
- Orders with legacy **pieces** quantities cannot be completed under this allocation trigger until they are converted to can quantities.
- The trigger operates on **status transitions only**. Editing the items of an already completed order does not retroactively adjust its previous allocation.
- **No historical allocation backfill**: previously completed orders are left unchanged to avoid double-counting undocumented historical production.
- A future enhancement can add waste, damaged cans, expiry and order-specific batch tracing.

## Testing
- Check a 5-can order, 2 cans already baked: completing it must fail rather than going negative.
- Record 3 more cans: completing succeeds and allocates 5; available decreases by 5.
- Reopening returns 5 available, and increases active demand by 5.
- Completing two orders against the same baked stock cannot double-spend cans.
- A new pending customer order automatically increases outstanding production after admin refresh.
- Confirm unauthorized accounts cannot read the allocation and event tables or invoke recording functions.
- Check notifications and totals after refreshing the Admin dashboard.
