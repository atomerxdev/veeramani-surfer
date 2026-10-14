import { expect, test } from '@playwright/test';
import { bootGame, snapshot, startRun, watchForErrors } from './helpers';

/**
 * Production bundle smoke test.
 *
 * Runs against `vite preview` (see the `production-chromium` project), so it
 * exercises the minified, bundled build rather than the dev server. `npm run
 * test:e2e` builds first; running Playwright directly requires an existing dist/.
 */

test('the production build boots, plays and scores', async ({ page }) => {
  const errors = watchForErrors(page);
  await bootGame(page);

  // The built page loads exactly one JS bundle and one stylesheet.
  const assets = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src], link[rel="stylesheet"]')).map(
      (node) => (node as HTMLScriptElement).src || (node as HTMLLinkElement).href,
    ),
  );
  expect(assets.length).toBeGreaterThan(0);
  expect(assets.every((url) => !url.includes('/src/'))).toBe(true);

  await startRun(page);
  await page.waitForTimeout(1000);
  const playing = await snapshot(page);
  expect(playing.state).toBe('Playing');
  expect(playing.distance).toBeGreaterThan(0);
  expect(playing.segmentOrigins).toHaveLength(5);

  // Rendering actually happened: the canvas has non-zero pixels.
  const painted = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    return { width: canvas.width, height: canvas.height };
  });
  expect(painted.width).toBeGreaterThan(200);
  expect(painted.height).toBeGreaterThan(200);

  expect(errors).toEqual([]);
});

test('the production build survives a restart loop without errors', async ({ page }) => {
  const errors = watchForErrors(page);
  await bootGame(page);

  for (let run = 0; run < 3; run += 1) {
    await startRun(page);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__SANTHAI__?.debugForceGameOver());
    await expect(page.locator('[data-screen="gameover"]')).toHaveClass(/is-active/);
    await page.locator('[data-screen="gameover"] [data-action="restart"]').click();
    await expect.poll(async () => (await snapshot(page)).state).toBe('Playing');
  }

  // Repeated runs keep the object counts bounded.
  const after = await snapshot(page);
  expect(after.hazards).toBeLessThan(40);
  expect(after.segmentOrigins).toHaveLength(5);
  expect(errors).toEqual([]);
});
