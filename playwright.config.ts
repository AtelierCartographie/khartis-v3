import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Limit workers to avoid DuckDB thread exhaustion (each browser creates thread pool)
  workers: isCI ? 2 : 4,
  reporter: isCI ? [['blob'], ['github']] : 'html',
  globalSetup: './e2e/global-setup.ts',
  timeout: isCI ? 90000 : 60000,
  expect: {
    timeout: isCI ? 30000 : 20000
  },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Disable video locally for speed
    video: isCI ? 'retain-on-failure' : 'off',
    actionTimeout: isCI ? 20000 : 15000,
    navigationTimeout: isCI ? 20000 : 15000,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris'
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: true
      }
    }
  ],

  webServer: {
    command: isCI ? 'pnpm preview' : 'pnpm build && pnpm preview',
    port: 4173,
    reuseExistingServer: !isCI,
    timeout: isCI ? 60000 : 120000,
    stdout: 'pipe',
    stderr: 'pipe'
  }
});
