import {NextRequest,NextResponse} from 'next/server'

/**
 * Deploy this repository as TWO Vercel projects.
 * SITE_MODE=customer => public ordering only
 * SITE_MODE=admin    => restricted admin dashboard only
 * This is deployment-level route isolation; Supabase Auth + RLS remain mandatory.
 */
export function proxy(request: NextRequest) {
  const mode = process.env.SITE_MODE === 'customer' ? 'customer' : 'admin'
  const { pathname } = request.nextUrl

  // Always prevent a public customer deployment from serving the admin route.
  if (mode === 'customer') {
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return new NextResponse('Not found', { status: 404 })
    }
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/order', request.url))
    }
    return NextResponse.next()
  }

  // Admin deployment has no customer order submission endpoints or storefront.
  if (pathname === '/order' || pathname.startsWith('/order/') ||
      pathname === '/api/guest-orders' || pathname.startsWith('/api/guest-orders/')) {
    return new NextResponse('Not found', {status:404})
  }
  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/admin', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js)$).*)'],
}
