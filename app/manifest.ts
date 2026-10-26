import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'BiscuitFlow — Biscuit Order & Inventory',
    short_name: 'BiscuitFlow',
    description: 'Private biscuit orders, recipes and ingredient inventory.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8f5f0',
    theme_color: '#8e5e42',
    lang: 'en',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
      { src: '/apple-icon.png', type: 'image/png', sizes: 'any' }
    ]
  }
}
