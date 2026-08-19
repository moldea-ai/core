import { createServer } from 'node:net';

import { defineConfig, devices } from '@playwright/test';
import { DEFAULT_BASE_PATH, normalizeBasePath } from '@moldea.ai/website-ui/site';

/**
 * Reserves an available loopback port long enough to resolve its assigned number.
 * @returns A promise that resolves to an OS-assigned port.
 */
const getAvailableLoopbackPort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not resolve an available loopback port for Playwright.'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });

const configuredPreviewPort = process.env.MOLDEA_PACKAGES_WEBSITE_E2E_PORT;
const basePath = normalizeBasePath(process.env.BASE_PATH ?? DEFAULT_BASE_PATH);
const previewPort =
  configuredPreviewPort === undefined
    ? await getAvailableLoopbackPort()
    : Number(configuredPreviewPort);

if (!Number.isInteger(previewPort) || previewPort < 1 || previewPort > 65_535) {
  throw new Error('MOLDEA_PACKAGES_WEBSITE_E2E_PORT must be an integer between 1 and 65535.');
}

// retain the main process's selected port for Playwright worker config reloads
process.env.MOLDEA_PACKAGES_WEBSITE_E2E_PORT = String(previewPort);

const previewOrigin = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.test-e2e.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: previewOrigin,
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
    command: `pnpm build && pnpm exec vite preview --base ${basePath} --host 127.0.0.1 --port ${previewPort} --strictPort`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: new URL(basePath, previewOrigin).href,
  },
});
