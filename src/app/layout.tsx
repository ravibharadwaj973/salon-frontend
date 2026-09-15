import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'Parlon',
    template: '%s · Parlon',
  },
  description: 'Run the entire salon and bring customers back automatically.',
  applicationName: 'Parlon',
  manifest: '/manifest.webmanifest',
  // Added to a home screen, it should say Parlon and open without browser chrome.
  appleWebApp: { capable: true, title: 'Parlon', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#EA580C',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
