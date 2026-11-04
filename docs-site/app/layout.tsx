import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Provider } from '@/components/provider';
import './global.css';

export const metadata = {
  title: {
    default: 'SiteScout docs',
    template: '%s · SiteScout docs',
  },
  description:
    'Evidence-traced site selection for Ho Chi Minh City, built on Geoapify.',
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
