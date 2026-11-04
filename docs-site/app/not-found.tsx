import Link from 'next/link';
import { GitHubIcon } from '@/components/icons';
import { repoUrl } from '@/lib/shared';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/" className="ss-brand" aria-label="SiteScout home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="" width={18} height={18} aria-hidden />
          <span className="ss-brand-sep" aria-hidden>
            /
          </span>
          <span className="tracking-tight">Docs</span>
        </Link>
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
          <Link href="/docs" className="ss-btn-primary">
            Docs
          </Link>
        </div>
      </header>

      <main
        id="nd-page"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24"
      >
        <p className="font-mono text-[13px] text-fd-muted-foreground">404</p>
        <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-[-0.022em] md:text-[2.5rem]">
          Page not found
        </h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-fd-muted-foreground">
          The page you are looking for does not exist or has moved. Head back
          home, or start from the documentation.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Link href="/" className="ss-btn-primary ss-btn-lg">
            Back home
          </Link>
          <Link
            href="/docs"
            className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
          >
            Browse docs
          </Link>
        </div>
      </main>
    </div>
  );
}
