# Two-website BiscuitFlow preview — separate Vercel projects

This branch is an **experiment**. Nothing is merged into main or deployed to your production domain.

## Expected behavior
| URL | Customer deployment (SITE_MODE=customer) | Admin deployment (SITE_MODE=admin) |
| --- | --- | --- |
| / | Public customer ordering storefront | Supabase admin sign-in / dashboard |
| /order | Customer ordering | 404 |
| /admin | 404 | Admin sign-in / dashboard |
| /api/guest-orders | Public catalog and validated guest order API | 404 |

The public customer deployment never displays an admin button. The admin deployment shows the existing dashboard login and management screens. Both connect to the existing Supabase project and the same order data. This is **route isolation, not separate compiled source bundles**: stronger physical isolation would require distinct application roots/builds. Server-side permissions and Supabase RLS remain essential.

## Create two Vercel projects (DO NOT repoint the existing production project yet)
1. Import the **same GitHub repository** twice into separate new Vercel projects. Use the same repository, not another GitHub repo.
2. In Project A (e.g. `tan-bakery-customer-preview`), set **Environment Variables**:
    - `SITE_MODE=customer`
    - `NEXT_PUBLIC_SUPABASE_URL` = existing Supabase URL
    - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = existing browser-safe publishable key
3. In Project B (e.g. `tan-bakery-admin-preview`), set:
    - `SITE_MODE=admin`
    - the same two Supabase browser-safe environment variables
4. For each project, create a Preview deployment of branch `feature/separate-customer-admin-sites-preview`. Review the Preview URLs. **Do not modify your current production project** or change domains yet.
5. Enable Vercel Authentication / access controls on the Admin preview project. Leave customer preview access controlled until you finish security testing.
6. Vercel's production branch configuration can later be set to the tested branch or you can merge after review and use main. Do not promote this experimental branch to Production now.

## Test locally
Run one development server at a time. Windows PowerShell:
```powershell
git fetch origin
git switch feature/separate-customer-admin-sites-preview
pnpm install --frozen-lockfile
$env:SITE_MODE='customer'; pnpm dev
# Check / => customer storefront; /admin => 404
# Stop dev server (Ctrl+C), then:
$env:SITE_MODE='admin'; pnpm dev
# Check / => admin sign-in; /order => 404
```
Run `pnpm exec tsc --noEmit` and `pnpm build` in **both** modes (Next config currently ignores TypeScript errors for build).

## Security/go-live checklist
- Backup existing Supabase; apply `supabase/migrations/20261026_guest_orders_roles.sql` only after reviewing the earlier prerequisite migration. Explicitly assign the correct existing admin Auth user to `bakery_admins` and verify that only that user is authorized.
- Test Supabase RLS directly: anonymous visitors and non-admin users must not read/modify recipes, inventory, other people's orders, or private guest contacts.
- Test customer orders with published biscuits. Confirm Pending orders show after admin reload, and calculations use can quantities.
- Add production anti-bot and per-IP rate limiting/CAPTCHA; current basic per-phone throttling does not prevent distributed spam.
- Check no backend service-role / database admin key is exposed through client environment variables.
- Use a **separate Admin Vercel project**, plus admin authentication, ideally MFA and additional deployment access protection.
- Do not merge or go live until builds, migrations, auth, and security tests pass.

## Important limitation
A single repo containing both route implementations still ships both routes in the build; the `proxy.ts` checks deny normal HTTP access, but they are not an authorization boundary. The real protection is enforced in Supabase, and the admin app can receive an additional deployment access gate. To completely eliminate admin code from the customer build, we would refactor into a monorepo with separate `apps/customer` and `apps/admin` roots.
