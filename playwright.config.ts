import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [['html'], ['github']] : 'html',
  globalSetup: './e2e/global-setup.ts',
  timeout: isCI ? 90000 : 45000,
  expect: {
    timeout: isCI ? 30000 : 15000
  },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: isCI ? 30000 : 15000,
    navigationTimeout: isCI ? 30000 : 15000,
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
    command: 'pnpm build && pnpm preview',
    port: 4173,
    reuseExistingServer: !isCI,
    timeout: isCI ? 180000 : 120000,
    stdout: 'pipe',
    stderr: 'pipe'
  }
});
