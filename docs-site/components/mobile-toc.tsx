import { ChevronDown, List } from 'lucide-react';
import type { TOCItemType } from 'fumadocs-core/toc';

export function MobileToc({ items }: { items: TOCItemType[] }) {
  if (items.length === 0) return null;

  return (
    <details className="ss-mobile-toc not-prose xl:hidden">
      <summary>
        <span>On this page</span>
        <ChevronDown className="ss-toc-chevron" aria-hidden />
        <List className="ss-toc-list" aria-hidden />
      </summary>
      <nav aria-label="On this page">
        <ul>
          {items.map((item) => (
            <li key={item.url} data-depth={item.depth}>
              <a href={item.url}>{item.title}</a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
