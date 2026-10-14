import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level tests.
 *
 * Three projects:
 *  - desktop-chromium: gameplay + UI at a desktop viewport
 *  - mobile-chromium:  same plus the mobile-only viewport/swipe checks
 *  - production-chromium: the built bundle served by `vite preview`
 *
 * Two web servers run side by side (dev on 4173, preview on 4174). The preview
 * server needs a `dist/` directory, which is why `npm run test:e2e` builds first.
 */
/**
 * Optional branded-browser mode. Set PLAYWRIGHT_CHANNEL=chrome (or msedge) to run
 * the suite against an installed browser instead of Playwright's bundled build -
 * useful on machines where the browser download is unavailable.
 */
// Read through globalThis so this config typechecks without @types/node.
const channel = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env?.['PLAYWRIGHT_CHANNEL'];

const channelUse: { channel?: string } = channel ? { channel } : {};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    // Note: `localhost` (not 127.0.0.1) because Vite's dev server may bind IPv6.
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: ['**/mobile.spec.ts', '**/production.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        ...channelUse,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile-chromium',
      testMatch: ['**/gameplay.spec.ts', '**/ui.spec.ts', '**/mobile.spec.ts'],
      use: {
        ...devices['Pixel 5'],
        ...channelUse,
        viewport: { width: 393, height: 851 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'production-chromium',
      testMatch: ['**/production.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        ...channelUse,
        viewport: { width: 1280, height: 800 },
        baseURL: 'http://localhost:4174',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run preview -- --port 4174 --strictPort',
      url: 'http://localhost:4174',
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
