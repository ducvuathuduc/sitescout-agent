import { llms, loader } from 'fumadocs-core/source';
import type { PageTreeTransformer } from 'fumadocs-core/source';
import { docsRoute } from './shared';
import { defineDocs } from 'fumadocs-mdx/macro';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import navConfig from '../nav.config.json';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// The generated pages keep the source H1 as frontmatter `title`; the sidebar
// uses the shorter labels from nav.config.json. Meta.json controls order.
const navTitles = new Map<string, string>();
for (const group of navConfig.groups) {
  for (const item of group.items) {
    navTitles.set(item.slug === '' ? docsRoute : `${docsRoute}/${item.slug}`, item.title);
  }
}

const navTitleTransformer: PageTreeTransformer = {
  file(node) {
    if (!('url' in node) || typeof node.url !== 'string') return node;
    const url = node.url.replace(/\/+$/, '') || docsRoute;
    const title = navTitles.get(url);
    return title ? { ...node, name: title } : node;
  },
};

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [{ name: 'nav-titles', transformPageTree: navTitleTransformer }],
});

export const docsLlms = llms(source, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${await page.data.getText('processed')}`,
});
