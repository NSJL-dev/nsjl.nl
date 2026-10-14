import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'csp-nonces.spec.ts',
  outputDir: '../../test-results/csp-browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {baseURL: process.env.NSJL_CSP_TEST_URL || 'http://127.0.0.1:3210', headless: true, trace: 'off', screenshot: 'off', video: 'off'},
});
