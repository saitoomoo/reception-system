import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests require both servers running:
 *   Frontend: cd frontend && npm run dev        (port 5173)
 *   Backend:  cd backend && go run ./cmd/server (port 8080)
 *
 * Run tests:
 *   npx playwright test
 *   npx playwright test --ui   (interactive)
 */
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // tests share DB state — run sequentially
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:5173',
    actionTimeout: 10_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Push API requires a secure context or localhost
        ignoreHTTPSErrors: true,
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    cwd: './frontend',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
