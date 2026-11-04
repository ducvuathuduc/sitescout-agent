// Fumadocs meta.json generation. Root meta lists every page explicitly so the
// sidebar is flat (no collapsible folders) and follows nav.config.json.
// Folder metas are still written for direct folder navigation and to keep
// folder titles/labels consistent.

function slugToMetaPath(slug) {
  if (slug === '') return 'index';
  if (slug === 'agent') return 'agent/index';
  return slug;
}

function groupForSlug(groups, slug) {
  return groups.find((group) => group.items.some((item) => item.slug === slug));
}

function folderMeta(groups, folder) {
  const items = groups.flatMap((group) => group.items).filter((item) => item.slug === folder || item.slug.startsWith(`${folder}/`));
  if (items.length === 0) return null;

  const self = items.find((item) => item.slug === folder);
  const group = groupForSlug(groups, self ? folder : items[0].slug);
  const title = self ? self.title : group?.label ?? folder;

  const pages = [];
  for (const item of items) {
    if (item.slug === folder) {
      pages.push('index');
    } else {
      pages.push(item.slug.slice(folder.length + 1));
    }
  }

  return {
    title,
    defaultOpen: true,
    collapsible: false,
    pages,
  };
}

/**
 * Returns [{ path, data }] where path is relative to content/docs.
 */
export function buildMetaFiles(navConfig) {
  const groups = navConfig.groups ?? [];
  const rootPages = [];

  for (const group of groups) {
    rootPages.push(`---${group.label}---`);
    const flattened = new Set();

    for (const item of group.items) {
      const folder = item.slug.split('/')[0];
      // Folders are flattened into the root with "...folder", so their own
      // meta.json controls the child order and no collapsible folder appears.
      if (folder === 'agent' || folder === 'clients' || folder === 'benchmarks') {
        if (flattened.has(folder)) continue;
        flattened.add(folder);
        rootPages.push(`...${folder}`);
      } else {
        rootPages.push(slugToMetaPath(item.slug));
      }
    }
  }

  const files = [
    {
      path: 'meta.json',
      data: {
        title: 'Docs',
        pages: rootPages,
      },
    },
  ];

  for (const folder of ['agent', 'clients', 'benchmarks']) {
    const data = folderMeta(groups, folder);
    if (data) files.push({ path: `${folder}/meta.json`, data });
  }

  return files;
}
