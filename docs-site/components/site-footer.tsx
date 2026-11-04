import { demoUrl } from '@/lib/layout.shared';
import { repoUrl } from '@/lib/shared';

export function SiteFooter() {
  return (
    <footer className="ss-site-footer">
      <a href={`${repoUrl}/blob/main/LICENSE`} className="ss-footer-license" aria-label="SiteScout MIT License">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon.svg" alt="" width={20} height={20} />
        <span>MIT License</span>
      </a>
      <nav aria-label="Footer">
        <a href={repoUrl}>GitHub</a>
        <a href={demoUrl}>Live demo</a>
        <a href="https://www.geoapify.com">Geoapify</a>
      </nav>
      <a href="https://www.geoapify.com" className="ss-footer-credit">Powered by Geoapify</a>
    </footer>
  );
}
