import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SwRegister } from './sw-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'TIMEFLOW',
  description: 'Registra, organiza y analiza en qué inviertes tu tiempo.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'TIMEFLOW', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1110' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&family=Sora:wght@600;700&display=swap"
        />
      </head>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
