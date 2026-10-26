# BiscuitFlow mobile setup

1. Create a Vercel project and import GitHub repo WT-26/Biscuit-Order-Inventory-Management-System. Use Next.js preset, root directory `.`, and the `main` branch for production.
2. In Vercel project Settings > Environment Variables, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, exactly as configured in local `.env.local`. Apply to Production (and Preview if needed). Never expose a secret/service-role key.
3. Confirm Supabase SQL migration was executed and your private admin account can sign in. In Supabase Authentication > URL Configuration, set Site URL to your published HTTPS URL; add callback URLs only if implementing email auth redirects.
4. Deploy, open the HTTPS URL on your mobile phone and sign in using the same Supabase admin account.
5. iPhone: Safari > Share > Add to Home Screen > Add. Android: Chrome > menu > Install app or Add to Home Screen (options vary).
6. Test create an ingredient on laptop, refresh on mobile, edit stock on mobile and refresh laptop. Confirm rows in Supabase Table Editor. Changes do not update live across already-open devices until they refresh.
7. Future improvements: provide proper 192x192 and 512x512 PNG icons to improve Android install compatibility; implement service worker and an intentional offline strategy. This basic PWA does NOT provide offline orders, push notifications, or automatic background sync.
8. Keep admin sign-up closed once your personal admin account is created. A published URL is publicly reachable but business records must remain protected by Supabase Auth and RLS.

Note: Vercel Hobby is for personal, non-commercial usage. Select commercial-permitted hosting before operating an actual business.
