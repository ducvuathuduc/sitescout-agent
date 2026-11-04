// The "Recorded sessions" page is derived from agent/transcripts/*.jsonl and
// the outcome column of the recorded-transcripts table in agent/README.md.
// It is deterministic: no build timestamps, no locale-dependent formatting.
import { buildFrontmatter } from './frontmatter.mjs';

export const TRANSCRIPTS_REPO_DIR = 'agent/transcripts';
export const TRANSCRIPTS_GITHUB_URL = `https://github.com/ducvuathuduc/sitescout-agent/blob/main/${TRANSCRIPTS_REPO_DIR}`;
export const HOST_LABEL = 'open-weight model via agent/host.mjs';
export const SESSIONS_TITLE = 'Recorded sessions';
export const SESSIONS_DESCRIPTION =
  'Recorded SiteScout MCP sessions with open-weight models, with the outcome of each run and a link to the transcript.';

/** Session id is the transcript filename prefix before the first hyphen. */
export function sessionId(fileName) {
  return fileName.replace(/\.jsonl$/i, '').split('-')[0];
}

/** Parse the first line of a transcript. */
export function parseSessionRecord(text, fileName = '<transcript>') {
  const firstLine = String(text)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) throw new Error(`${fileName}: empty transcript`);

  let record;
  try {
    record = JSON.parse(firstLine);
  } catch {
    throw new Error(`${fileName}: first line is not valid JSON`);
  }

  if (!record.ts || !record.model || !record.server?.name || !record.server?.version) {
    throw new Error(`${fileName}: session record needs ts, model, server.name and server.version`);
  }

  const date = new Date(record.ts);
  if (Number.isNaN(date.getTime())) throw new Error(`${fileName}: invalid ts ${record.ts}`);

  return {
    id: sessionId(fileName),
    date: date.toISOString().slice(0, 10),
    model: String(record.model),
    serverName: String(record.server.name),
    serverVersion: String(record.server.version),
  };
}

/**
 * Map transcript id prefix -> outcome, from the Markdown table in
 * agent/README.md. Rows that are not transcripts are ignored.
 */
export function parseOutcomeTable(readme) {
  const outcomes = new Map();

  for (const line of String(readme).split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    const fileCell = cells[1] ?? '';
    const match = /`([^`]+\.jsonl)`/.exec(fileCell);
    if (!match) continue;

    const id = sessionId(match[1]);
    const outcome = cells[3] ?? '';
    outcomes.set(id, outcome || 'not recorded');
  }

  return outcomes;
}

function cell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function transcriptUrl(fileName) {
  return `${TRANSCRIPTS_GITHUB_URL}/${encodeURIComponent(fileName)}`;
}

/**
 * Build the full Markdown page.
 * `transcripts` is [{ file, text }] in the order the caller wants (we sort).
 */
export function buildSessionsPage({ transcripts, readme }) {
  const outcomes = parseOutcomeTable(readme);
  const rows = transcripts
    .map(({ file, text }) => ({ file, record: parseSessionRecord(text, file) }))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map(({ file, record }) => {
      const outcome = outcomes.get(record.id) ?? 'not recorded';
      return {
        ...record,
        file,
        outcome,
        server: `${record.serverName} ${record.serverVersion}`,
        url: transcriptUrl(file),
      };
    });

  const body = [
    `Host for every session: ${HOST_LABEL}. The outcome column comes from the recorded-transcripts table in [agent/README.md](/docs/agent).`,
    '',
    '| Session | Date | Model | Server | Outcome | Transcript |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (row) =>
        `| \`${cell(row.id)}\` | ${cell(row.date)} | \`${cell(row.model)}\` | ${cell(row.server)} | ${cell(row.outcome)} | [${cell(row.file)}](${row.url}) |`,
    ),
    '',
  ].join('\n');

  return {
    title: SESSIONS_TITLE,
    description: SESSIONS_DESCRIPTION,
    rows,
    content: `${buildFrontmatter({ title: SESSIONS_TITLE, description: SESSIONS_DESCRIPTION })}${body}`,
  };
}
