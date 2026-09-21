import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8101', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'python3 scripts/serve.py --port 8101',
    url: 'http://127.0.0.1:8101/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PROOFLINE_DB_PATH: '.local/browser-tests.sqlite3', PROOFLINE_OLLAMA_MODEL: '' },
  },
});
