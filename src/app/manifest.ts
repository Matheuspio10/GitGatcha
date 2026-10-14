import type { MetadataRoute } from 'next';

/**
 * Web app manifest: lets phones install GitGacha on the home screen (PWA).
 * Icons are rendered from src/app/icon.svg by scripts/build-app-icons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GitGacha - Dev Card Game',
    short_name: 'GitGacha',
    description: 'Collect developers, build your deck, rule the repository.',
    start_url: '/store',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#06060b',
    theme_color: '#06060b',
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Open packs', url: '/inventory' },
      { name: 'Battle', url: '/battle' },
      { name: 'Collection', url: '/collection' },
    ],
  };
}
