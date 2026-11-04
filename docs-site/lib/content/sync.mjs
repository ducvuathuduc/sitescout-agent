// Orchestrates the build-time content pipeline. Kept separate from the CLI so
// tests can run it against a temporary repository.
import fs from 'node:fs';
import path from 'node:path';
import { buildFrontmatter, withFrontmatter } from './frontmatter.mjs';
import { buildAssetPlan, collectImageReferences, copyAssets, rewriteMarkdownLinks } from './links.mjs';
import { buildMetaFiles } from './meta.mjs';
import { buildSessionsPage } from './sessions.mjs';
import { CONTENT_SRC_PAGES, SYNC_SOURCES } from './sources.mjs';
import { cleanMarkdownHeadings } from './headings.mjs';

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath}`);
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

// Generated pages use LF. The source files are checked out with CRLF on
// Windows, so normalise before splitting lines.
function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
}

/**
 * Generate content/docs/** from the repository Markdown.
 * Returns { pages, meta, assets } for logging and tests.
 * @param {{ repoRoot: string, docsSiteDir: string, log?: (message: string) => void }} options
 */
export function runSync({ repoRoot, docsSiteDir, log = () => {} }) {
  const contentDir = path.join(docsSiteDir, 'content', 'docs');
  const publicAssetsDir = path.join(docsSiteDir, 'public', 'docs-assets');
  const navConfig = JSON.parse(fs.readFileSync(path.join(docsSiteDir, 'nav.config.json'), 'utf8'));
  const sources = SYNC_SOURCES;
  const navTitles = new Map(navConfig.groups.flatMap((group) => group.items)
    .map((item) => [item.slug, item.title]));

  // Validate every input before touching generated output.
  for (const page of CONTENT_SRC_PAGES) {
    ensureFile(
      path.join(docsSiteDir, page.from),
      `hand-written page ${page.from}`,
    );
  }
  for (const source of sources) {
    ensureFile(path.join(repoRoot, source.from), `source document ${source.from}`);
  }

  const documents = sources.map((source) => ({
    ...source,
    absolutePath: path.join(repoRoot, source.from),
    text: readText(path.join(repoRoot, source.from)),
  }));

  // Collect referenced docs images before rewriting, so collisions can be
  // resolved globally and every asset gets a stable name.
  const imageRefs = new Set();
  for (const document of documents) {
    const refs = collectImageReferences(document.text, {
      repoRoot,
      sourcePath: document.absolutePath,
    });
    for (const ref of refs) imageRefs.add(ref);
  }

  const assetPlan = buildAssetPlan([...imageRefs], { repoRoot });

  // Render everything in memory first: a broken link must fail before any
  // generated file is removed or overwritten.
  const rendered = documents.map((document) => {
    const parsed = withFrontmatter(document.text, { sourcePath: document.from });
    const body = rewriteMarkdownLinks(parsed.body, {
      repoRoot,
      sourcePath: document.absolutePath,
      sourceRelPath: document.from,
      sources,
      assets: assetPlan,
    });

    return {
      out: document.out,
      content: `${buildFrontmatter({
        title: document.slug.startsWith('clients/') ? navTitles.get(document.slug) ?? parsed.title : parsed.title,
        description: parsed.description,
      })}${cleanMarkdownHeadings(body)}`,
    };
  });

  ensureFile(path.join(repoRoot, 'agent', 'README.md'), 'agent/README.md (recorded transcripts table)');
  const transcriptDir = path.join(repoRoot, 'agent', 'transcripts');
  if (!fs.existsSync(transcriptDir)) {
    throw new Error(`Missing transcripts directory: ${transcriptDir}`);
  }

  const transcriptFiles = fs
    .readdirSync(transcriptDir)
    .filter((file) => file.endsWith('.jsonl'))
    .sort();
  const transcripts = transcriptFiles.map((file) => ({
    file,
    text: readText(path.join(transcriptDir, file)),
  }));
  const readme = readText(path.join(repoRoot, 'agent', 'README.md'));
  const sessions = buildSessionsPage({ transcripts, readme });
  const meta = buildMetaFiles(navConfig);

  // Only now touch generated output.
  fs.rmSync(publicAssetsDir, { recursive: true, force: true });
  copyAssets(assetPlan, publicAssetsDir);

  fs.rmSync(contentDir, { recursive: true, force: true });
  fs.mkdirSync(contentDir, { recursive: true });

  const pages = [];

  for (const page of rendered) {
    writeFile(path.join(contentDir, page.out), page.content);
    pages.push(page.out);
  }

  for (const page of CONTENT_SRC_PAGES) {
    const source = path.join(docsSiteDir, page.from);
    const target = path.join(contentDir, page.out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    pages.push(page.out);
  }

  writeFile(path.join(contentDir, 'agent', 'sessions.md'), sessions.content);
  pages.push('agent/sessions.md');

  for (const file of meta) {
    writeFile(path.join(contentDir, file.path), `${JSON.stringify(file.data, null, 2)}\n`);
  }

  log(`[sync-content] wrote ${pages.length} pages and ${meta.length} meta files`);
  log(`[sync-content] copied ${assetPlan.size} docs images to public/docs-assets`);

  return {
    pages: pages.sort(),
    meta: meta.map((file) => file.path),
    assets: [...assetPlan.values()].sort(),
  };
}
