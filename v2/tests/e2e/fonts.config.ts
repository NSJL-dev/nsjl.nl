import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'local-fonts.spec.ts',
  outputDir: '../../test-results/fonts-browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {baseURL: process.env.NSJL_FONT_TEST_URL || 'http://127.0.0.1:3210', headless: true, trace: 'off', screenshot: 'off', video: 'off'},
});
