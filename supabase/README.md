# BiscuitFlow cloud setup
1. Create a Supabase project at https://supabase.com/dashboard.
2. Open SQL Editor and execute migrations/20261025_initial_schema.sql.
3. In Authentication > Providers enable Email, and create an account via the app sign-up form.
4. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from your Supabase project.
5. Run pnpm install and pnpm dev. Sign up/sign in to use cloud-backed orders, recipes, and inventory.
6. On Vercel, configure the same environment variables and redeploy.
   
Security: business data is private to each authenticated account via RLS. For a shared team, an organization/membership model is needed; separate accounts currently cannot view each other's data.
Existing localStorage data is **not** migrated automatically. Sample recipes/stock are not inserted automatically into newly created accounts. Never use a service_role/secret key in NEXT_PUBLIC variables.
Database data is online; Supabase Auth may still store a login session in the browser.
