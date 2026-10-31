import { redirect } from 'next/navigation'

// The main BiscuitFlow deployment is the admin workspace.
// The /admin page checks Supabase login and the bakery_admins role.
export default function HomePage() {
  redirect('/admin')
}
