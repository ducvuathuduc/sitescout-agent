#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Next 16's static client requests dot-joined segment filenames, but its
// exporter writes directories (next.js#85374). Keep both representations.
export function rscAliases(relativeFile) {
  const parts = relativeFile.split(path.sep);
  return parts.flatMap((part, index) =>
    index < parts.length - 1 && part.startsWith('__next.')
      ? [path.join(...parts.slice(0, index), parts.slice(index).join('.'))]
      : [],
  );
}

export function fixRscPaths(outDir) {
  let copies = 0;
  function walk(dir) {
    // Snapshot each directory before adding aliases so repeated runs are safe.
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        for (const alias of rscAliases(path.relative(outDir, file))) {
          const target = path.join(outDir, alias);
          const bytes = fs.readFileSync(file);
          if (fs.existsSync(target) && fs.readFileSync(target).equals(bytes)) continue;
          fs.writeFileSync(target, bytes);
          copies += 1;
        }
      }
    }
  }
  walk(outDir);
  return copies;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = fileURLToPath(new URL('../out/', import.meta.url));
  console.log(`[fix-rsc-paths] wrote ${fixRscPaths(outDir)} flat RSC files`);
}
