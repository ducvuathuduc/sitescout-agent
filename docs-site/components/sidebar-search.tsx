'use client';

import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { Search } from 'lucide-react';

export function SidebarSearch() {
  const { enabled, setOpenSearch, hotKey } = useSearchContext();

  if (!enabled) return null;

  return (
    <button
      type="button"
      className="ss-search-trigger"
      onClick={() => setOpenSearch(true)}
      aria-label="Search docs"
      data-search-trigger="sidebar"
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">Search docs…</span>
      <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
        {hotKey.map((key, index) => (
          <kbd key={index}>{key.display}</kbd>
        ))}
      </span>
    </button>
  );
}
