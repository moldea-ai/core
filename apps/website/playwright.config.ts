import { defineConfig, devices } from '@playwright/test';
import { DEFAULT_BASE_PATH, normalizeBasePath } from '@moldea.ai/website-ui/site';

const basePath = normalizeBasePath(process.env.BASE_PATH ?? DEFAULT_BASE_PATH);
const previewOrigin = 'http://127.0.0.1:4322';

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.test-e2e.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4322',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --base ${basePath} --host 127.0.0.1 --port 4322 --strictPort`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: new URL(basePath, previewOrigin).href,
  },
});
