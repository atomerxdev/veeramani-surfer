import { expect, type Page } from '@playwright/test';

/** Shape of the debug snapshot exposed by GameApp (see src/app/GameApp.ts). */
export interface Snapshot {
  state: string;
  distance: number;
  score: number;
  tokens: number;
  best: number;
  speed: number;
  tier: number;
  pressure: number;
  hazards: number;
  tokensOnTrack: number;
  pickups: number;
  segmentOrigins: number[];
  chaseDistance: number;
  fps: number;
  player: {
    lane: number;
    x: number;
    y: number;
    motion: string;
    sliding: boolean;
    grounded: boolean;
    invulnerable: boolean;
    gameOver: boolean;
    /** Takeoffs since the run began - latches jumps, which last ~0.7 s. */
    jumps: number;
  };
  activePowerUps: string[];
}

/** Collects console errors and uncaught exceptions for a page. */
export function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/** Load the game with a fixed track seed and wait until the menu is interactive. */
export async function bootGame(page: Page, seed = 424242): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await page.waitForFunction(() => Boolean(window.__SANTHAI__), undefined, { timeout: 20_000 });
  await page.waitForFunction(() => window.__SANTHAI__?.debugState === 'MainMenu', undefined, {
    timeout: 20_000,
  });
  await expect(page.locator('[data-screen="menu"]')).toHaveClass(/is-active/);
}

export async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const app = window.__SANTHAI__;
    if (!app) throw new Error('debug handle missing');
    return app.debugSnapshot;
  });
}

export async function state(page: Page): Promise<string> {
  return page.evaluate(() => window.__SANTHAI__?.debugState ?? 'Unknown');
}

/**
 * Start (or restart) a run and wait until it is actually simulating.
 *
 * Only the *visible* screen is queried: the pause and game-over screens both have
 * a restart button, and clicking the hidden one would hang.
 */
export async function startRun(page: Page): Promise<void> {
  if ((await state(page)) === 'Playing') {
    await expect(page.locator('[data-screen="hud"]')).toHaveClass(/is-active/);
    return;
  }

  const menuPlay = page.locator('[data-screen="menu"].is-active [data-action="play"]');
  if (await menuPlay.isVisible()) {
    await menuPlay.click();
  } else {
    await page.locator('.screen.is-active [data-action="restart"]').first().click();
  }

  await page.waitForFunction(() => window.__SANTHAI__?.debugState === 'Playing', undefined, {
    timeout: 10_000,
  });
  await expect(page.locator('[data-screen="hud"]')).toHaveClass(/is-active/);
}

/** Wait until a condition on the snapshot holds (bounded by Playwright's expect). */
export async function waitForSnapshot(
  page: Page,
  predicate: (snap: Snapshot) => boolean,
  timeout = 8_000,
): Promise<void> {
  await expect.poll(async () => predicate(await snapshot(page)), { timeout }).toBe(true);
}

/** The canvas bounding box in CSS pixels. */
export async function canvasBox(page: Page): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const box = await page.locator('#game-canvas').boundingBox();
  if (!box) throw new Error('canvas has no layout box');
  return box;
}

/**
 * Simulated swipe: a pointer drag from the middle of the canvas.
 *
 * The drag crosses the threshold in a single interpolated `mouse.move` with
 * `steps`, so the gesture costs one protocol round trip instead of four. Note
 * that the browser still cannot report the resulting action back instantly, so
 * callers should not poll for states that last well under a second - see the
 * takeoff counter used for jumps.
 */
export async function swipe(
  page: Page,
  direction: 'left' | 'right' | 'up' | 'down',
  distance = 90,
): Promise<void> {
  const box = await canvasBox(page);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height * 0.55;
  const delta = {
    left: { x: -distance, y: 0 },
    right: { x: distance, y: 0 },
    up: { x: 0, y: -distance },
    down: { x: 0, y: distance },
  }[direction];

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Four interpolated points in one round trip: the gesture still crosses the
  // swipe threshold gradually, exactly as a finger would.
  await page.mouse.move(startX + delta.x, startY + delta.y, { steps: 4 });
  await page.mouse.up();
}
