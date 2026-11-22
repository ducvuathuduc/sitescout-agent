/**
 * Signals file reading (Node-only).
 *
 * Split out of ./signals.ts on purpose: the browser demo bundles the
 * engine (web/src/app.ts → src/engine/scout.ts → ./signals.ts), and a
 * `node:fs` import there breaks the web build (`demo:dry-run`). Only the
 * CLI reads signals files from disk; everything the browser needs lives
 * in the pure ./signals.ts. Never import this module from browser code.
 */
import { readFileSync } from "node:fs";
import { SignalsFileSchema, type SignalsFile } from "./signals.js";

/**
 * Read + validate a signals file. Throws an Error naming the file and the
 * first problem — never returns partial signals.
 */
export function parseSignalsFile(path: string): SignalsFile {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`signals file ${path}: cannot read (${(e as Error).message})`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`signals file ${path}: invalid JSON (${(e as Error).message})`);
  }
  const parsed = SignalsFileSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`signals file ${path}: ${first.path.join(".")}: ${first.message}`);
  }
  return parsed.data;
}
