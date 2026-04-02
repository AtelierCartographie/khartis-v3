import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: 'html',
  timeout: process.env.CI ? 120000 : 30000,
  use: {
    baseURL: 'http://localhost:5176',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: process.env.CI ? 30000 : 10000,
    storageState: 'tests/e2e/storage-state.json'
  },
  expect: {
    timeout: process.env.CI ? 30000 : 10000
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--enable-webgl',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-gpu-rasterization',
            '--ignore-gpu-blocklist',
            '--disable-gpu-sandbox'
          ]
        }
      }
    }
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5176',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
