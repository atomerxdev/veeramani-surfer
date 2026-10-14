import { test } from '@playwright/test';
import { bootGame, snapshot } from './helpers';

/** Temporary: capture verification frames into docs/verification. */
test('capture intro and chase frames', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await bootGame(page);
  await page.screenshot({ path: 'docs/verification/00-menu.png' });

  await page.evaluate(() => {
    const w = window as unknown as { __PIN?: number };
    w.__PIN = window.setInterval(() => {
      const app = window.__SANTHAI__;
      if (app && app.debugState === 'Intro') app['introTimer'] = 0.8;
    }, 8);
  });
  await page.locator('[data-screen="menu"].is-active [data-action="play"]').click();
  await page.waitForFunction(() => window.__SANTHAI__?.debugState === 'Intro');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/verification/01-vlog.png' });

  await page.evaluate(() => {
    const w = window as unknown as { __PIN?: number };
    window.clearInterval(w.__PIN);
    w.__PIN = window.setInterval(() => {
      const app = window.__SANTHAI__;
      if (app && app.debugState === 'Intro') app['introTimer'] = 2.6;
    }, 8);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/verification/02-boys-charging.png' });

  await page.evaluate(() => {
    const w = window as unknown as { __PIN?: number };
    window.clearInterval(w.__PIN);
    w.__PIN = window.setInterval(() => {
      const app = window.__SANTHAI__;
      if (app && app.debugState === 'Intro') app['introTimer'] = 3.5;
    }, 8);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/verification/03-handoff.png' });

  await page.evaluate(() => {
    const w = window as unknown as { __PIN?: number };
    window.clearInterval(w.__PIN);
    w.__PIN = undefined;
  });
  await page.waitForFunction(() => window.__SANTHAI__?.debugState === 'Playing');
  await page.waitForFunction(() => (window.__SANTHAI__?.debugSnapshot.distance ?? 0) > 5);
  await page.screenshot({ path: 'docs/verification/04-run-start.png' });

  await page.waitForFunction(() => (window.__SANTHAI__?.debugSnapshot.distance ?? 0) > 45);
  await page.screenshot({ path: 'docs/verification/05-chase-mid.png' });
  const mid = await snapshot(page);
  console.log('MID distance=' + mid.distance + ' chase=' + mid.chaseDistance + ' state=' + mid.state);
});
