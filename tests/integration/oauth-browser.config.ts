import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import path from 'node:path';
export default defineConfig({
  testDir: '.', testMatch: 'oauth-browser.spec.ts', workers: 1, fullyParallel: false, retries: 0,
  reporter: 'list', outputDir: path.join(tmpdir(), 'gongzhi-oauth-pg-browser-' + Date.now()),
  use: { channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
    // F arms one response wait before the full three-navigation OAuth login.
    // Real PG/Chrome needs a bounded login window, not the fixture's 15s window.
    actionTimeout: 60000, trace: 'off', screenshot: 'off', video: 'off' },
  expect: { timeout: 15000 },
  webServer: { command: 'node --import tsx tests/integration/oauth-browser-server.mjs',
    cwd: path.resolve(import.meta.dirname, '../..'),
    url: 'http://127.0.0.1:3091/api/gongzhi/health', reuseExistingServer: false,
    env: { GONGZHI_OAUTH_BROWSER_TEST: 'true' }, timeout: 30000 },
});
