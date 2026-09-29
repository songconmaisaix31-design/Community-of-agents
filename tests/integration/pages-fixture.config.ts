import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import path from 'node:path';
export default defineConfig({
  testDir: '.', testMatch: 'pages-fixture.spec.ts', workers: 1,
  timeout: 60_000, expect: { timeout: 15_000 }, reporter: 'list',
  outputDir: path.join(tmpdir(), 'gongzhi-pages-browser-' + Date.now()),
  use: { browserName: 'chromium', channel: 'chrome', headless: true,
    viewport: { width: 1440, height: 1000 }, actionTimeout: 15_000,
    trace: 'off', screenshot: 'off', video: 'off' },
});
