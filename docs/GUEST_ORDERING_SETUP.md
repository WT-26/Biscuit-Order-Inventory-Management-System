# Guest ordering rollout (DRAFT — do not merge before testing)

## What this change does
- Customer storefront at `/`, no login required.
- Admin dashboard at `/admin`, authenticated with Supabase and explicitly checked against `bakery_admins` via a security-definer function.
- Only **published** recipes show in the customer catalog. Publishing exposes names, not ingredients, yields or stock.
- Guests can order up to 10 different biscuit types and 100 cans total, enter a name, phone, email and pickup date, and receive an order reference. Orders are inserted directly into existing `biscuit_orders` with `Pending` status, so the calculator and production planning use existing order_items with `cans` amounts.
- Guest phone/email stored in private `biscuit_guest_order_contacts` and displayed to admin in Customer Orders.
- Order Calendar now uses actual order dates and a selectable month (admin refresh required to see orders made from other devices).

## Prerequisites and migration
1. **Backup** your existing Supabase data before running any SQL.
2. Ensure `supabase/migrations/20261026_cans_shopping.sql` from PR #13 has been applied. This work builds upon PR #13, currently in `main` as of branch creation.
3. Open the existing Supabase project's SQL Editor and run `supabase/migrations/20261026_guest_orders_roles.sql`.
4. **Manually execute the commented-out admin enrollment INSERT statement**, replacing REPLACE_WITH_ADMIN_EMAIL with the exact Supabase Auth email for your owner account, e.g.:

   ```sql
   insert into public.bakery_admins(user_id)
   select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
   on conflict (user_id) do nothing;
   ```

   Do not enroll customer accounts. The storefront only works after an admin is enrolled. Roles are verified from the DB, not from an email stored in client code.
5. Log in to `/admin`, open Biscuit Recipes, and tick **List this biscuit on the public customer ordering page** for each biscuit to publish; save each recipe.
6. Check that Vercel Production deployment is reachable publicly, but keep preview deployments protected when possible. Ensure your existing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY point to the correct project.
7. In VS Code, run `pnpm install --frozen-lockfile`, `pnpm build` and `pnpm dev`. Note the project's Next config currently skips TypeScript build errors; separately run `pnpm exec tsc --noEmit` and fix any errors.
8. Manually test in a clean private browser session before merging. Do not expose the customer order link publicly until abuse protections are set.

## Tests required before merge
- **Admin role:** known admin can log in; another valid Supabase user trying `/admin` is redirected to `/`. An unauthenticated session cannot see admin pages. Also test direct REST queries with the customer's bearer token against orders, stock, recipes, guest contacts and shopping list; must not expose admin data. Never rely on frontend redirect as permission enforcement.
- **Catalog privacy:** guests see only published recipe names; no recipe ingredients, stock, price or owner data. Unpublished items are rejected by the RPC even if a customer guesses a recipe ID.
- **Guest orders:** choose 2 cans of type A and 3 cans of type B, enter name/phone/email/date; the admin sees a new Pending order and private contact info. Refresh admin to load external orders. Calendar/production planning/calculator should reflect actual cans and estimated ingredients.
- **Input safety:** reject missing contacts, invalid date, negative/fractional/zero/over-limit can counts, duplicate recipe IDs, oversized bodies, fake unpublished recipe IDs; test direct calls to `submit_guest_biscuit_order` (not just the webpage).
- **Abuse:** test maximum three submissions per phone in an hour. This does not defend against rotating phone numbers or distributed bots: enable production edge/IP rate limiting, CAPTCHA/Turnstile verification with server-side verification, and operational monitoring before opening to the public.
- **Data integrity:** confirm old orders and stock remain untouched following migration and deployment, and admin's existing account sees existing data.
- **Mobile:** check input visibility, tap targets, date picker, and receipt on Android/iPhone.

## Limitations and security decisions
- This first version is for **one bakery admin owner**. The SQL RPC uses the first enrolled admin; do not enroll another bakery owner until multi-tenant selection is designed.
- The customer has no account, no payment collection, no automated customer email, no order status tracking, and no delivery address. Orders are pickup requests.
- A submitted request is not a confirmed sale. Admin should verify contact details.
- There is no fully atomic stock reservation or stock deduction on new orders; the calculator reports expected ingredients from active orders.
- Admin state currently fetches data at login or page refresh; production planning and calendar are updated after reloading the dashboard, not by realtime subscription.
- The guest order RPC uses SECURITY DEFINER and must be reviewed and tested against direct API manipulation; its publicly callable DB function has business validations and simple per-phone throttling, but not edge-based abuse prevention.
- Do NOT merge until the migration, admin enrollment, independent `tsc` check, build, manual security tests and anti-abuse protection have been completed.
