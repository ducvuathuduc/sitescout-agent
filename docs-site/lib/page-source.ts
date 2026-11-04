import { CONTENT_SRC_PAGES, SYNC_SOURCES } from './content/sources.mjs';
import { gitConfig, repoUrl } from './shared';

export function getPageSourceUrl(pagePath: string) {
  const synced = SYNC_SOURCES.find((page) => page.out === pagePath);
  const authored = CONTENT_SRC_PAGES.find((page) => page.out === pagePath);
  const sourcePath = synced?.from ?? (authored ? `docs-site/${authored.from}` :
    pagePath === 'agent/sessions.md' ? 'agent/README.md' : undefined);
  if (!sourcePath) throw new Error(`No source file for ${pagePath}`);
  return `${repoUrl}/edit/${gitConfig.branch}/${sourcePath}`;
}
