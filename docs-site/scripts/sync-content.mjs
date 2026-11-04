#!/usr/bin/env node
// Build-time content pipeline: repository Markdown -> docs-site/content/docs.
// Run from anywhere; paths are resolved from this file, not the current cwd.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSync } from '../lib/content/sync.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsSiteDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(docsSiteDir, '..');

try {
  runSync({
    repoRoot,
    docsSiteDir,
    log: (message) => console.log(message),
  });
} catch (error) {
  console.error(`[sync-content] ${error.message}`);
  process.exitCode = 1;
}
