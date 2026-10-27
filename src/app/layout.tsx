import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Toast } from '@/components/client';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Onera', template: '%s · Onera' },
  description: 'Client portal, CRM, invoicing and e-signatures for creative studios.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&family=Caveat:wght@500&display=swap" />
      </head>
      <body>
        <div className="wrapper">{children}</div>
        <Suspense fallback={null}><Toast /></Suspense>
      </body>
    </html>
  );
}
