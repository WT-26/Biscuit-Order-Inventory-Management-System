# BiscuitFlow can-based ordering, shopping and production planning

## Required database migration
In your existing Supabase project, open SQL Editor and run `supabase/migrations/20261026_cans_shopping.sql` before merging and deploying this feature. It adds `cans_per_batch` to recipes (defaults to 1 for existing records) and the owner-private `biscuit_shopping_items` table. It does not delete existing records.

## Recipe configuration
Open Biscuit Recipes > Edit recipe and enter **Pieces per batch** and **Cans per batch**. Example: 1,000 pieces, 5 cans => 200 pieces/can. Cans and pieces must both be positive integers, and pieces must be evenly divisible by cans.

## Orders
New customer order form accepts **cans**, not pieces. 2 cans of a 200-pieces/can recipe creates demand for 400 pieces. Existing orders stored as `pieces` still calculate as pieces; they are NOT automatically converted into cans because historical packaging size is unknown.

## Ingredient requirement
For 1,000 pieces / 5 cans, a 2-can order uses 2/5 of each ingredient's full-batch recipe quantity. Aggregate required = sum across all active orders. Shortage = max(0, required - available stock), with compatible g/kg and ml/L conversion. Fractional eggs are mathematically calculated, so round up to whole eggs for actual purchasing if necessary. Finished/cancelled orders are excluded.

## Shopping
Admin can manually add an ingredient and purchase quantity to the shopping list, saved under the authenticated account. This planned purchase does not change inventory. **Receive + add to stock** increases the old quantity by the received amount and removes the manual shopping item. Automatic shortage warnings recalculate using the new quantity. The automatic shortage list also has Receive stock. Note that two independent database writes are not an atomic transaction; confirm both changes persisted before closing, particularly on intermittent internet.

## Production
Production Planning lists active orders by deadline, totals cans/pieces per recipe, and estimates full-batch counts using ceiling(pieces required / batch yield). Ingredient calculator uses proportionate actual pieces required rather than rounded full batches; if your baking process forces whole-batch production, extra ingredients for unused output must be planned separately.

## Verification
- Use a test recipe requiring 500 g butter for 1,000 pieces / 5 cans; an order for 2 cans must require 200 g butter.
- Set available butter to 100 g; shopping list should warn 100 g shortage.
- Add a manual purchase for 60 g butter. Merely adding it should **not** reduce shortage.
- Receive 60 g; inventory should become 160 g and remaining shortage should be 40 g.
- Receive 50 g more; inventory should become 210 g and shortage warning should disappear.
- Refresh on phone and laptop to confirm Supabase records persist.

Never run destructive migrations or seed scripts on your live database without a backup. There is not yet a transactional inventory movement ledger or automatic synchronization among concurrently open devices.
