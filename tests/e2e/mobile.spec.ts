import { expect, test } from '@playwright/test';
import { bootGame, canvasBox, snapshot, startRun, swipe, watchForErrors } from './helpers';

/**
 * Mobile-specific checks: viewport fit, no page scrolling while playing, the
 * on-screen touch pad and swipe gestures.
 *
 * Note on gestures: the input layer reads pointer events, which serve mouse and
 * touch alike, so Playwright's mouse API produces genuine pointerdown/move/up
 * gestures through the same code path a finger would take. The on-screen pad
 * buttons are tapped directly.
 */

test.beforeEach(async ({ isMobile }) => {
  test.skip(!isMobile, 'mobile viewport only');
});

test('canvas and UI fit the mobile viewport without page scrolling', async ({ page }) => {
  const errors = watchForErrors(page);
  await bootGame(page);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const box = await canvasBox(page);
  expect(box.width).toBeGreaterThan(viewport!.width - 2);
  expect(box.height).toBeGreaterThan(viewport!.height - 2);

  const metrics = await page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    bodyScrollWidth: document.body.scrollWidth,
    bodyScrollHeight: document.body.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    touchAction: getComputedStyle(document.getElementById('game-canvas') as HTMLElement)
      .touchAction,
  }));
  expect(metrics.scrollX).toBe(0);
  expect(metrics.scrollY).toBe(0);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
  // touch-action: none is what stops the page scrolling during a swipe.
  expect(metrics.touchAction).toBe('none');

  // Every screen's panel fits inside the viewport. Screens are checked one at a
  // time because a hidden panel has no layout box.
  const checkPanel = async (screen: string): Promise<void> => {
    const panel = await page.locator(`[data-screen="${screen}"] .panel`).boundingBox();
    expect(panel, `${screen} panel should be laid out`).not.toBeNull();
    expect(panel!.x).toBeGreaterThanOrEqual(-1);
    expect(panel!.y).toBeGreaterThanOrEqual(-1);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport!.width + 1);
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport!.height + 1);
  };

  await checkPanel('menu');
  await page.locator('[data-screen="menu"] [data-action="tutorial"]').click();
  await expect(page.locator('[data-screen="tutorial"]')).toHaveClass(/is-active/);
  await checkPanel('tutorial');
  await page.locator('[data-screen="tutorial"] [data-action="menu"]').click();
  await page.locator('[data-screen="menu"] [data-action="settings"]').click();
  await expect(page.locator('[data-screen="settings"]')).toHaveClass(/is-active/);
  await checkPanel('settings');
  expect(errors).toEqual([]);
});

test('the touch pad is offered on touch devices and moves the runner', async ({ page }) => {
  await bootGame(page);
  await startRun(page);

  const pad = page.locator('[data-touch-pad]');
  await expect(pad).toBeVisible();
  await expect(pad.locator('[data-touch-action="left"]')).toBeVisible();

  await pad.locator('[data-touch-action="left"]').click();
  await expect.poll(async () => (await snapshot(page)).player.lane).toBe(0);

  await pad.locator('[data-touch-action="right"]').click();
  await expect.poll(async () => (await snapshot(page)).player.lane).toBe(1);

  await pad.locator('[data-touch-action="jump"]').click();
  await expect.poll(async () => (await snapshot(page)).player.grounded).toBe(false);
  await expect.poll(async () => (await snapshot(page)).player.grounded, { timeout: 4000 }).toBe(
    true,
  );

  await pad.locator('[data-touch-action="slide"]').click();
  await expect.poll(async () => (await snapshot(page)).player.sliding).toBe(true);
});

test('swipe gestures drive the same actions as the keyboard', async ({ page }) => {
  const errors = watchForErrors(page);
  await bootGame(page);
  await startRun(page);
  await page.evaluate(() => window.__SANTHAI__?.debugGrantPowerUp('shield'));

  await swipe(page, 'left');
  await expect.poll(async () => (await snapshot(page)).player.lane).toBe(0);

  await swipe(page, 'right');
  await expect.poll(async () => (await snapshot(page)).player.lane).toBe(1);

  // Jump. The runner is only airborne for ~0.7 s, which is shorter than the
  // gesture's own protocol round trips on this page, so the takeoff counter
  // latches the event instead of racing a poll against `grounded`.
  const jumpsBefore = (await snapshot(page)).player.jumps;
  await swipe(page, 'up');
  await expect.poll(async () => (await snapshot(page)).player.jumps).toBeGreaterThan(
    jumpsBefore,
  );
  // ...and the runner always comes back down to keep running.
  await expect.poll(async () => (await snapshot(page)).player.grounded, { timeout: 4000 }).toBe(
    true,
  );

  await swipe(page, 'down');
  await expect.poll(async () => (await snapshot(page)).player.sliding).toBe(true);

  // Swiping must never scroll the page.
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBe(0);
  expect(errors).toEqual([]);
});

test('portrait gameplay keeps the HUD readable and on screen', async ({ page }) => {
  await bootGame(page);
  await startRun(page);
  const viewport = page.viewportSize()!;

  for (const selector of ['[data-bind="hud-score"]', '[data-bind="hud-tokens"]', '[data-action="pause"]']) {
    const box = await page.locator(selector).boundingBox();
    expect(box, `${selector} should be laid out`).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  }

  // Landscape rotation still works without reloading.
  await page.setViewportSize({ width: 851, height: 393 });
  await page.waitForTimeout(400);
  const landscapeBox = await canvasBox(page);
  expect(landscapeBox.width).toBeGreaterThan(landscapeBox.height);
  const panel = await page.locator('[data-screen="hud"]').boundingBox();
  expect(panel).not.toBeNull();
});

