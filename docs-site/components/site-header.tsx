'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu } from 'lucide-react';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import { SidebarTrigger } from 'fumadocs-ui/layouts/notebook/slots/sidebar';
import { GitHubIcon } from '@/components/icons';
import { demoUrl, navMenus, primaryLink, type NavMenu } from '@/lib/layout.shared';
import { repoUrl } from '@/lib/shared';

function isActive(url: string, pathname: string) {
  if (url === '/docs') return pathname === '/docs' || pathname === '/docs/';
  return pathname === url || pathname.startsWith(`${url}/`);
}

function MenuTrigger({ menu }: { menu: NavMenu }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = menu.items.some((item) => isActive(item.url, pathname));

  return (
    <div
      ref={ref}
      className="relative"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') setOpen(false);
      }}
    >
      <button
        type="button"
        className="ss-nav-link"
        aria-haspopup="menu"
        aria-expanded={open}
        data-open={open || undefined}
        data-active={active || undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {menu.text}
        <ChevronDown
          className="size-3 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="ss-nav-menu" role="menu" aria-label={menu.text}>
          {menu.items.map((item) => (
            <Link
              key={item.url}
              href={item.url}
              role="menuitem"
              className="ss-nav-menu-item"
              data-active={isActive(item.url, pathname) || undefined}
              onClick={() => setOpen(false)}
            >
              {item.text}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="ss-header sticky top-0 z-30 border-b [grid-column:1/-1] [grid-row:1]">
      <div className="ss-header-inner flex h-16 w-full items-center gap-3 px-6">
        <Link href="/" className="ss-brand" aria-label="SiteScout home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="" width={20} height={20} aria-hidden />
          <span className="ss-brand-sep" aria-hidden>
            /
          </span>
          <span className="tracking-tight">Docs</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {navMenus.map((menu) => (
            <MenuTrigger key={menu.text} menu={menu} />
          ))}
          <Link
            href={primaryLink.url}
            className="ss-nav-link"
            data-active={isActive(primaryLink.url, pathname) || undefined}
          >
            {primaryLink.text}
          </Link>
        </nav>

        <div className="ms-auto flex items-center gap-1.5">
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="ss-icon-btn"
            aria-label="GitHub repository"
          >
            <GitHubIcon className="size-4" />
          </a>
          <ThemeSwitch className="border-fd-border p-1 [&_svg]:size-4 [&_svg]:p-0" />
          <a
            href={demoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="ss-btn-primary ms-1 hidden sm:inline-flex"
          >
            Live demo
          </a>
          <span className="md:hidden">
            <SidebarTrigger className="ss-icon-btn">
              <Menu className="size-4" />
            </SidebarTrigger>
          </span>
        </div>
      </div>
    </header>
  );
}
