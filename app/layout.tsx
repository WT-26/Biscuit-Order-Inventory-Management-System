import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BiscuitFlow — Bakery Operations',
  description: 'Manage biscuit orders, recipes, inventory, and production in one warm workspace.',
  generator: 'v0.app',
  applicationName: 'BiscuitFlow',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'BiscuitFlow' },
  icons: { icon: '/favicon-32.png', apple: '/apple-icon.png' },
}

export const viewport: Viewport = {
  themeColor: '#8e5e42',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
