import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.expo/playwright-results',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL,
      },
    },
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
  ],
});
