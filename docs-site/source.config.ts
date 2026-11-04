import { defineConfig } from 'fumadocs-mdx/config';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins/remark-mdx-mermaid';
import remarkIncludeSymbol from './lib/remark-include-symbol.mjs';

export default defineConfig({
  mdxOptions: {
    preset: 'fumadocs',
    remarkPlugins: [remarkMdxMermaid, remarkIncludeSymbol],
    rehypeCodeOptions: {
      themes: {
        // The default light theme's comment grey (#6e7781) only reaches 4.35:1
        // on the #fafafa code surface; the high-contrast variant keeps the same
        // palette at 4.83:1.
        light: 'github-light-high-contrast',
        dark: 'github-dark-default',
      },
      defaultColor: false,
    },
  },
});
