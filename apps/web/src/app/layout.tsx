import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic, Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppProviders } from '@/providers/app-providers';
import './globals.css';

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-arabic',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OmniOps — Enterprise Inventory & Order Operations',
  description: 'Multi-Warehouse Sales, Inventory & Audit Operations Dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${ibmPlexArabic.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-canvas font-sans text-ink-primary antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
