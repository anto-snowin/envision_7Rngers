import type { Metadata, Viewport } from 'next';
import { Figtree, Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/providers';
import './globals.css';

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  weight: ['600', '700', '800', '900'],
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Sentinel — Dementia Care GPS Monitoring',
    template: '%s · Sentinel',
  },
  description:
    'Real-time GPS tracking and intelligent geofencing for dementia care. The patient phone reports location; the caretaker dashboard watches safe zones and danger zones live.',
  applicationName: 'Sentinel',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#080908',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${inter.variable} ${mono.variable} dark`}>
      <body className="min-h-dvh bg-ink-950 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
