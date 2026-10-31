# Recipe pricing (draft)

## What changes
- Admin > Biscuit Recipes > New/Edit Recipe: set **Selling price per can (RM)**.
- Customer catalog shows per-can prices and a live total before submission.
- After placing an order, the confirmation displays the total calculated from current database prices on the server.
- Each new guest order stores `biscuit_orders.total_price` so changing recipe prices later does not alter the order's original total.
- Existing orders retain a NULL total, and previously created recipes initially have price RM 0. Admin must set a positive price before a published item is available for guest orders.

## Required setup
1. Back up the **existing** shared Supabase database.
2. Apply `supabase/migrations/20261031_recipe_prices.sql` to that same database, after the existing guest-order migration.
3. In Admin > Biscuit Recipes, edit each public recipe, set the RM price per can, and save.
4. Deploy the updated customer and admin code to Preview environments using the same Supabase project.
5. Run `pnpm exec tsc --noEmit` and `pnpm build`; currently the Next.js config can suppress TS build errors.
6. Test: 2 cans × RM 28.00 + 3 cans × RM 16.50 = **RM 105.50**; verify cart total, receipt total, and stored `total_price` match.
7. Test changing a recipe price after an order: the old order's stored total must remain unchanged.
8. Verify that clients cannot control the saved price by adding fake price fields to requests and that unpublished or unpriced biscuit types cannot be ordered.

**Do not merge or deploy before the SQL migration, build and security tests.**
