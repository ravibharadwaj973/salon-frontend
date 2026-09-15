import type { MetadataRoute } from 'next';

/**
 * The web manifest, so a receptionist can add Parlon to a phone or tablet home
 * screen and have it open like an app — no browser chrome, the right icon, and
 * the brand orange behind the status bar. `standalone` is deliberate: the desk
 * uses this all day and a visible address bar only invites stray navigation.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Parlon',
    short_name: 'Parlon',
    description: 'Run the entire salon and bring customers back automatically.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FDFAF6',
    theme_color: '#EA580C',
    icons: [
      { src: '/parlon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/parlon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
