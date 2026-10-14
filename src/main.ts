/**
 * Browser entry point.
 *
 * Boots the game, wires the canvas and keeps a small debug handle on `window` so
 * browser-level tests (and curious players) can inspect the run state.
 */

import './styles/main.css';
import { GameApp } from './app/GameApp';
import { inject } from '@vercel/analytics';
import { pruneObsoleteStorage } from './core/StorageManager';

declare global {
  interface Window {
    /** Debug/test handle. Not used by gameplay code. */
    __SANTHAI__?: GameApp;
  }
}

function showFatal(message: string): void {
  const root = document.getElementById('ui-root');
  const loading = document.querySelector<HTMLElement>('[data-screen="loading"]');
  const panel = loading?.querySelector('.panel') ?? root;
  if (!panel) return;
  panel.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Veeramani Surfer could not start';
  const body = document.createElement('p');
  body.className = 'muted';
  body.textContent = message;
  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.textContent =
    'This game needs a browser with WebGL enabled. Try the latest Chrome, Edge, Firefox or Safari.';
  panel.append(heading, body, hint);
}

function boot(): void {
  // Prune any obsolete localStorage keys from removed features (e.g. legacy local leaderboard)
  pruneObsoleteStorage();

  // Initialize Vercel Web Analytics
  inject();

  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    showFatal('The game canvas is missing from the page.');
    return;
  }

  const options: { canvas: HTMLCanvasElement; seed?: number } = { canvas };

  // Optional seed override: index.html?seed=1234 gives a reproducible track.
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  if (seedParam) {
    const parsed = Number.parseInt(seedParam, 10);
    if (Number.isFinite(parsed)) options.seed = parsed;
  }

  try {
    const app = new GameApp(options);
    app.init();
    app.start();
    window.__SANTHAI__ = app;

    // User gestures unlock audio (respects browser autoplay policy).
    // Keep listeners active until the AudioContext is confirmed running.
    const unlock = async (): Promise<void> => {
      const running = await app.unlockAudio();
      if (running) {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showFatal(message);
    // Re-throw so the failure is visible in the console during development.
    throw error;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
