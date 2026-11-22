/**
 * Checklist file reading (Node-only).
 *
 * Split out of ./checklist.ts on purpose: the browser demo bundles the
 * engine (web/src/app.ts → src/engine/scout.ts → ./checklist.ts), and a
 * `node:fs` import there breaks the web build (`demo:dry-run`). Only the
 * CLI reads checklist files from disk; everything the browser needs lives
 * in the pure ./checklist.ts. Never import this module from browser code.
 */
import { readFileSync } from "node:fs";
import { ChecklistFileSchema, type ChecklistFile } from "./checklist.js";

/**
 * Read + validate a checklist file. Throws an Error naming the file and the
 * first problem — never returns a partial checklist.
 */
export function parseChecklistFile(path: string): ChecklistFile {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`checklist file ${path}: cannot read (${(e as Error).message})`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`checklist file ${path}: invalid JSON (${(e as Error).message})`);
  }
  const parsed = ChecklistFileSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`checklist file ${path}: ${first.path.join(".")}: ${first.message}`);
  }
  return parsed.data;
}
