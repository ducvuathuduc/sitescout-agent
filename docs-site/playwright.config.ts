import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.DOCS_E2E_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * E2E tests run against the static export in `out/` (never `next dev`).
 * `tests/e2e/static-server.mjs` serves it with Cloudflare-Pages-style URL
 * resolution (`/docs/mcp` -> `out/docs/mcp/index.html`).
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './.cache/playwright',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true },
    },
  ],
  webServer: {
    // Playwright runs the command from this config's directory.
    command: 'node tests/e2e/static-server.mjs',
    url: BASE_URL,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
