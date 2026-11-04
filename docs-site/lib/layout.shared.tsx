import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared';
import { appName, repoUrl } from './shared';

export const demoUrl = 'https://sitescout.huynhthanh.workers.dev';

export interface NavMenuItem {
  text: string;
  url: string;
  description?: string;
}

export interface NavMenu {
  text: string;
  items: NavMenuItem[];
}

export const navMenus: NavMenu[] = [
  {
    text: 'Guides',
    items: [
      { text: 'Getting started', url: '/docs' },
      { text: 'How it works', url: '/docs/how-it-works' },
      { text: 'Tutorial', url: '/docs/tutorial' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'MCP reference', url: '/docs/mcp-reference' },
      { text: 'Provenance', url: '/docs/provenance' },
      { text: 'Edge cases', url: '/docs/edge-cases' },
      { text: 'Benchmarks', url: '/docs/benchmarks/hcmc-addresses' },
    ],
  },
];

export const primaryLink: NavMenuItem = { text: 'MCP', url: '/docs/mcp' };

const links: LinkItemType[] = [
  ...navMenus.map(
    (menu) =>
      ({
        type: 'menu',
        text: menu.text,
        items: menu.items.map((item) => ({ text: item.text, url: item.url })),
      }) as LinkItemType,
  ),
  { type: 'main', text: primaryLink.text, url: primaryLink.url },
  {
    type: 'button',
    text: 'Live demo',
    url: demoUrl,
    external: true,
    secondary: false,
  },
];

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="" width={20} height={20} aria-hidden />
          <span className="ss-brand-sep" aria-hidden>
            /
          </span>
          <span className="font-medium tracking-tight">Docs</span>
        </span>
      ),
      url: '/',
    },
    githubUrl: repoUrl,
    links,
  };
}

export { appName };
