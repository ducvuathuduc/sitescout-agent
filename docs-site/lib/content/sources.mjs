// The repository Markdown that becomes the docs site. Keep this list in the
// same order as the sidebar groups in nav.config.json where it matters.
export const SYNC_SOURCES = [
  { from: 'docs/tutorial.md', slug: 'tutorial', out: 'tutorial.md' },
  { from: 'docs/mcp.md', slug: 'mcp', out: 'mcp.md' },
  { from: 'docs/mcp-reference.md', slug: 'mcp-reference', out: 'mcp-reference.md' },
  { from: 'docs/demo-proxy.md', slug: 'demo-proxy', out: 'demo-proxy.md' },
  { from: 'docs/provenance.md', slug: 'provenance', out: 'provenance.md' },
  { from: 'docs/edge-cases.md', slug: 'edge-cases', out: 'edge-cases.md' },
  { from: 'docs/FEEDBACK.md', slug: 'geoapify-feedback', out: 'geoapify-feedback.md' },
  {
    from: 'agent/README.md', slug: 'agent', out: 'agent/index.md',
    // Older client guides still link to the heading before its date was removed.
    fragmentAliases: { 'recorded-transcripts-real-runs-2026-10-22': 'recorded-transcripts-real-runs' },
  },
  { from: 'agent/clients/claude-code.md', slug: 'clients/claude-code', out: 'clients/claude-code.md' },
  { from: 'agent/clients/cursor.md', slug: 'clients/cursor', out: 'clients/cursor.md' },
  { from: 'agent/clients/codex.md', slug: 'clients/codex', out: 'clients/codex.md' },
  { from: 'agent/clients/kiro.md', slug: 'clients/kiro', out: 'clients/kiro.md' },
  {
    from: 'agent/clients/claude-desktop.md',
    slug: 'clients/claude-desktop',
    out: 'clients/claude-desktop.md',
  },
  {
    from: 'agent/clients/geoapify-mcp-side-by-side.md',
    slug: 'clients/two-servers',
    out: 'clients/two-servers.md',
  },
  {
    from: 'agent/clients/record-claude-code.md',
    slug: 'clients/record-claude-code',
    out: 'clients/record-claude-code.md',
  },
  {
    from: 'bench/hcmc-addresses/RESULTS.md',
    slug: 'benchmarks/hcmc-addresses',
    out: 'benchmarks/hcmc-addresses.md',
  },
  {
    from: 'bench/vngeobench/EXPECTED.md',
    slug: 'benchmarks/vngeobench',
    out: 'benchmarks/vngeobench.md',
  },
];

// Hand-written MDX pages, copied verbatim (no frontmatter or link processing).
export const CONTENT_SRC_PAGES = [
  { from: 'content-src/getting-started.mdx', out: 'index.mdx' },
  { from: 'content-src/how-it-works.mdx', out: 'how-it-works.mdx' },
  { from: 'content-src/credits.mdx', out: 'credits.mdx' },
];
