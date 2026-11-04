import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, it } from 'vitest';
import { fixRscPaths } from '../scripts/fix-rsc-paths.mjs';

const cache = fileURLToPath(new URL('../.cache/', import.meta.url));
fs.mkdirSync(cache, { recursive: true });
const root = fs.mkdtempSync(path.join(cache, 'rsc-paths-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('preserves nested exports and writes byte-identical flat segment paths idempotently', () => {
  const bytes = Buffer.from([0, 13, 10, 255, 36, 0xc3, 0xa9]);
  const files = [
    ['docs/mcp/__next.docs/$oc$slug/__PAGE__.txt', 'docs/mcp/__next.docs.$oc$slug.__PAGE__.txt'],
    ['__next.!KGhvbWUp/__PAGE__.txt', '__next.!KGhvbWUp.__PAGE__.txt'],
    ['docs/__next.docs/$oc$slug/extra/segment.txt', 'docs/__next.docs.$oc$slug.extra.segment.txt'],
  ];
  for (const [source] of files) {
    const file = path.join(root, source);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>Unchanged</h1>');
  expect(fixRscPaths(root)).toBe(files.length);
  for (const [source, alias] of files) {
    expect(fs.readFileSync(path.join(root, source))).toEqual(bytes);
    expect(fs.readFileSync(path.join(root, alias))).toEqual(bytes);
  }
  expect(fixRscPaths(root)).toBe(0);
  // Repair an existing stale alias without changing the original file.
  fs.writeFileSync(path.join(root, files[0][1]), 'stale');
  expect(fixRscPaths(root)).toBe(1);
  expect(fs.readFileSync(path.join(root, files[0][1]))).toEqual(bytes);
  expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).toBe('<h1>Unchanged</h1>');
});
