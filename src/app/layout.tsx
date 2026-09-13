import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'Salon OS',
    template: '%s · Salon OS',
  },
  description: 'Run the entire salon and bring customers back automatically.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#B03A6B',
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
