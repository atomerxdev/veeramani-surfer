import { expect, test } from '@playwright/test';
import { bootGame, snapshot, startRun, state, watchForErrors } from './helpers';

/** Menus, overlays, settings and persistence. */

test('menu, tutorial and settings screens open and close correctly', async ({ page }) => {
  const errors = watchForErrors(page);
  await bootGame(page);

  await page.locator('[data-screen="menu"] [data-action="tutorial"]').click();
  await expect(page.locator('[data-screen="tutorial"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-screen="menu"]')).not.toHaveClass(/is-active/);
  expect(await state(page)).toBe('Tutorial');
  // The tutorial documents both control schemes.
  await expect(page.locator('[data-screen="tutorial"]')).toContainText('Swipe left');
  await expect(page.locator('[data-screen="tutorial"] kbd').first()).toBeVisible();

  await page.locator('[data-screen="tutorial"] [data-action="menu"]').click();
  await expect(page.locator('[data-screen="menu"]')).toHaveClass(/is-active/);

  await page.locator('[data-screen="menu"] [data-action="settings"]').click();
  await expect(page.locator('[data-screen="settings"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-screen="menu"]')).not.toHaveClass(/is-active/);

  // Only one screen is ever active at a time.
  const activeScreens = await page.locator('.screen.is-active').count();
  expect(activeScreens).toBe(1);

  await page.locator('[data-action="close-settings"]').click();
  await expect(page.locator('[data-screen="menu"]')).toHaveClass(/is-active/);
  expect(errors).toEqual([]);
});

test('one active screen at a time during play, pause and game over', async ({ page }) => {
  const errors = watchForErrors(page);
  await bootGame(page);
  await startRun(page);

  const activeScreens = async (): Promise<string[]> =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('.screen.is-active')).map(
        (node) => (node as HTMLElement).dataset['screen'] ?? '?',
      ),
    );

  expect(await activeScreens()).toEqual(['hud']);

  await page.locator('[data-action="pause"]').click();
  expect(await activeScreens()).toEqual(['hud', 'pause']);

  await page.locator('[data-screen="pause"] [data-action="settings"]').click();
  expect(await activeScreens()).toEqual(['settings']);

  await page.locator('[data-action="close-settings"]').click();
  expect(await activeScreens()).toEqual(['hud', 'pause']);

  await page.locator('[data-screen="pause"] [data-action="resume"]').click();
  expect(await activeScreens()).toEqual(['hud']);

  await page.locator('[data-action="pause"]').click();
  await page.locator('[data-screen="pause"] [data-action="quit"]').click();
  expect(await activeScreens()).toEqual(['menu']);
  expect(errors).toEqual([]);
});

test('settings persist and are re-applied after a reload', async ({ page }) => {
  await bootGame(page);

  await page.locator('[data-screen="menu"] [data-action="settings"]').click();
  await page.locator('#setting-quality').selectOption('low');
  await page.locator('#setting-reduced-motion').check();
  await page.locator('[data-action="close-settings"]').click();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('santhai-sprint.profile.v1') ?? '{}'),
  );
  expect(stored.settings.quality).toBe('low');
  expect(stored.settings.reducedMotion).toBe(true);

  await page.reload();
  await page.waitForFunction(() => window.__SANTHAI__?.debugState === 'MainMenu');
  await page.locator('[data-screen="menu"] [data-action="settings"]').click();
  await expect(page.locator('#setting-quality')).toHaveValue('low');
  await expect(page.locator('#setting-reduced-motion')).toBeChecked();
});

test('sound toggle survives a reload and is reflected in the menu', async ({ page }) => {
  await bootGame(page);
  await page.locator('[data-screen="menu"] [data-action="toggle-mute"]').click();
  await expect(page.locator('[data-action="toggle-mute"]')).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await page.waitForFunction(() => window.__SANTHAI__?.debugState === 'MainMenu');
  await expect(page.locator('[data-action="toggle-mute"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-action="toggle-mute"]')).toHaveText(/off/i);
});

test('best score is stored and shown after a run', async ({ page }) => {
  await bootGame(page);
  await page.evaluate(() => window.localStorage.removeItem('santhai-sprint.profile.v1'));
  await page.reload();
  await page.waitForFunction(() => window.__SANTHAI__?.debugState === 'MainMenu');
  await expect(page.locator('[data-bind="menu-best-score"]')).toHaveText('0');

  await startRun(page);
  await page.waitForTimeout(600);
  const beforeFinish = await snapshot(page);
  await page.evaluate(() => window.__SANTHAI__?.debugForceGameOver());
  await expect(page.locator('[data-screen="gameover"]')).toHaveClass(/is-active/);

  const score = await page.locator('[data-bind="gameover-score"]').textContent();
  expect(Number((score ?? '0').replace(/[^0-9]/g, ''))).toBeGreaterThanOrEqual(
    Number(beforeFinish.score),
  );

  await page.locator('[data-screen="gameover"] [data-action="quit"]').click();
  await expect(page.locator('[data-screen="menu"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-bind="menu-best-score"]')).not.toHaveText('0');
  await expect(page.locator('[data-bind="menu-runs"]')).toHaveText('1');
});

test('reset saved data clears the stored profile', async ({ page }) => {
  await bootGame(page);
  await startRun(page);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__SANTHAI__?.debugForceGameOver());
  await page.locator('[data-screen="gameover"] [data-action="quit"]').click();

  await page.locator('[data-screen="menu"] [data-action="settings"]').click();
  await page.locator('[data-action="reset-data"]').click();
  await expect(page.locator('[data-bind="seed-line"]')).toBeVisible();

  // Resetting drops the stored key entirely, so the next read is the default
  // profile. Either "absent" or "zeroed" is a valid reset state.
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('santhai-sprint.profile.v1'),
  );
  if (stored !== null) {
    const profile = JSON.parse(stored) as { bestScore: number; runs: number };
    expect(profile.bestScore).toBe(0);
    expect(profile.runs).toBe(0);
  }

  await page.locator('[data-action="close-settings"]').click();
  await expect(page.locator('[data-bind="menu-best-score"]')).toHaveText('0');
  await expect(page.locator('[data-bind="menu-runs"]')).toHaveText('0');
});
