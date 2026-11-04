import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Provider } from '@/components/provider';
import './global.css';
import type { Metadata } from 'next';
import { siteUrl } from '@/lib/shared';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'SiteScout Docs',
    template: '%s · SiteScout Docs',
  },
  description:
    'Evidence-traced site selection for Ho Chi Minh City, built on Geoapify.',
  openGraph: {
    title: 'SiteScout Docs',
    description: 'Compare sites in Ho Chi Minh City using Geoapify data and trace each result to its source.',
    siteName: 'SiteScout Docs',
    type: 'website',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <a href="#nd-page" className="ss-skip-link">
          Skip to content
        </a>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
