import { expect, test, type Page } from '@playwright/test';
import { bootGame, snapshot, startRun, state, watchForErrors } from './helpers';

/**
 * Core gameplay through the real browser: keyboard control, the lane rules, jump
 * and slide, pause, game over and restart. These run on both the desktop and the
 * mobile project; viewport-specific checks live in mobile.spec.ts.
 */

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = watchForErrors(page);
});

test.afterEach(() => {
  expect(errors, `page errors: ${errors.join('\n')}`).toEqual([]);
});

/** Keep the run alive long enough to steer: shields absorb one crash each. */
async function armShield(page: Page): Promise<void> {
  await page.evaluate(() => window.__SANTHAI__?.debugGrantPowerUp('shield'));
}

test('loads without fatal errors and shows the main menu', async ({ page }) => {
  await bootGame(page);
  await expect(page.locator('[data-screen="menu"] .logo__en')).toHaveText(/VEERAMANI SURFER/i);
  await expect(page.locator('[data-screen="menu"] .logo__ta')).toContainText('வீரமணி');
  await expect(page.locator('[data-screen="menu"] [data-action="play"]')).toBeVisible();
  await expect(page.locator('#game-canvas')).toBeVisible();
  expect(await page.evaluate(() => document.title)).toContain('Veeramani Surfer');
});

test('runs forward automatically and accumulates score and distance', async ({ page }) => {
  await bootGame(page);
  await startRun(page);

  const first = await snapshot(page);
  expect(first.state).toBe('Playing');
  expect(first.hazards).toBeGreaterThan(0);
  expect(first.segmentOrigins).toHaveLength(5);

  await page.waitForTimeout(1200);
  const later = await snapshot(page);
  expect(later.distance).toBeGreaterThan(first.distance);
  expect(later.score).toBeGreaterThan(first.score);
  expect(later.speed).toBeGreaterThan(first.speed);
  // Live tracks keep their meshes: the segment count never changes.
  expect(later.segmentOrigins).toHaveLength(5);
});

test('keyboard controls change lane, jump and slide', async ({ page }) => {
  await bootGame(page);
  await startRun(page);
  await armShield(page);

  const start = await snapshot(page);
  expect(start.player.lane).toBe(1);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).player.lane).toBe(0);
  await expect
    .poll(async () => (await snapshot(page)).player.x, { timeout: 4000 })
    .toBeLessThan(-1);

  await page.keyboard.press('KeyD');
  await expect.poll(async () => (await snapshot(page)).player.lane).toBe(1);
  await page.keyboard.press('KeyD');
  await expect.poll(async () => (await snapshot(page)).player.lane).toBe(2);
  // The rightmost lane is the wall.
  await page.keyboard.press('KeyD');
  await page.waitForTimeout(120);
  expect((await snapshot(page)).player.lane).toBe(2);

  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).player.grounded).toBe(false);
  await expect
    .poll(async () => (await snapshot(page)).player.motion)
    .toMatch(/jumping/);

  await expect.poll(async () => (await snapshot(page)).player.grounded, { timeout: 4000 }).toBe(true);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await snapshot(page)).player.sliding).toBe(true);
});

test('one press moves one lane, and auto-repeat is rejected', async ({ page }) => {
  await bootGame(page);
  await startRun(page);
  await armShield(page);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).player.lane).toBe(0);

  // A held key produces keydown events with repeat: true. Those must be ignored
  // so the runner cannot be driven across the road by a stuck key.
  const laneDuringRepeat = await page.evaluate(() => {
    for (let i = 0; i < 40; i += 1) {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'ArrowRight', repeat: true, bubbles: true }),
      );
    }
    return window.__SANTHAI__!.debugSnapshot.player.lane;
  });
  expect(laneDuringRepeat).toBe(0);
  await page.waitForTimeout(200);
  expect((await snapshot(page)).player.lane).toBe(0);

  // A genuine second press still moves exactly one lane.
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).player.lane).toBe(1);

  // Holding a real key also moves exactly one lane (Playwright sends no repeats).
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(150);
  expect((await snapshot(page)).player.lane).toBe(2);
});

test('pause freezes the simulation and resume continues it', async ({ page }) => {
  await bootGame(page);
  await startRun(page);
  await page.waitForTimeout(400);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="pause"]')).toHaveClass(/is-active/);
  expect(await state(page)).toBe('Paused');

  const frozen = await snapshot(page);
  await page.waitForTimeout(700);
  const stillFrozen = await snapshot(page);
  expect(stillFrozen.distance).toBe(frozen.distance);

  // Input is ignored while paused.
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  expect((await snapshot(page)).player.lane).toBe(frozen.player.lane);

  await page.keyboard.press('Escape');
  await expect.poll(() => state(page)).toBe('Playing');
  await expect
    .poll(async () => (await snapshot(page)).distance, { timeout: 5000 })
    .toBeGreaterThan(frozen.distance);
});

test('the pause menu can restart the run', async ({ page }) => {
  await bootGame(page);
  await startRun(page);
  await page.waitForTimeout(700);
  expect((await snapshot(page)).distance).toBeGreaterThan(0);

  await page.locator('[data-action="pause"]').click();
  await page.locator('[data-screen="pause"] [data-action="restart"]').click();

  await expect.poll(() => state(page)).toBe('Playing');
  const fresh = await snapshot(page);
  expect(fresh.distance).toBeLessThan(40);
  expect(fresh.score).toBeLessThan(40);
  expect(await page.locator('[data-screen="pause"]').getAttribute('class')).not.toContain(
    'is-active',
  );
});

test('game over shows a summary and restart creates a fresh run', async ({ page }) => {
  await bootGame(page);
  await startRun(page);

  await page.evaluate(() => window.__SANTHAI__?.debugForceGameOver());
  await expect(page.locator('[data-screen="gameover"]')).toHaveClass(/is-active/);
  expect(await state(page)).toBe('GameOver');
  await expect(page.locator('[data-bind="gameover-score"]')).not.toHaveText('');
  await expect(page.locator('[data-bind="gameover-reason"]')).not.toHaveText('');

  const finished = await snapshot(page);
  expect(finished.player.gameOver).toBe(true);

  // A forced game over does not advance the world.
  await page.waitForTimeout(400);
  expect((await snapshot(page)).distance).toBe(finished.distance);

  await page.locator('[data-screen="gameover"] [data-action="restart"]').click();
  await expect.poll(() => state(page)).toBe('Playing');
  await expect(page.locator('[data-screen="gameover"]')).not.toHaveClass(/is-active/);
  const fresh = await snapshot(page);
  expect(fresh.player.gameOver).toBe(false);
  expect(fresh.distance).toBeLessThan(40);
  expect(fresh.activePowerUps).toEqual([]);
});

test('power-ups activate with a duration and expire (never stack)', async ({ page }) => {
  await bootGame(page);
  await startRun(page);

  await page.evaluate(() => window.__SANTHAI__?.debugGrantPowerUp('shield'));
  await expect.poll(async () => (await snapshot(page)).activePowerUps).toContain('shield');
  await expect(page.locator('.badge--shield')).toBeVisible();

  // Granting it again refreshes the timer instead of adding a second badge.
  await page.evaluate(() => window.__SANTHAI__?.debugGrantPowerUp('shield'));
  await expect(page.locator('.badge--shield')).toHaveCount(1);

  // A fresh run clears every effect.
  await page.evaluate(() => window.__SANTHAI__?.debugForceGameOver());
  await page.locator('[data-screen="gameover"] [data-action="restart"]').click();
  await expect.poll(() => state(page)).toBe('Playing');
  expect((await snapshot(page)).activePowerUps).toEqual([]);
});
