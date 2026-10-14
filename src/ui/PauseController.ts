/**
 * Pause screen. Owns the "paused" heading state; the resume/settings/restart/quit
 * buttons are dispatched by UIManager so there is exactly one click handler.
 */

import { bindTarget, formatScore, setTextIfChanged } from './Dom';

export class PauseController {
  private readonly root = document.querySelector<HTMLElement>('[data-screen="pause"]');

  get element(): HTMLElement | null {
    return this.root;
  }

  show(score: number, tokens: number): void {
    setTextIfChanged(bindTarget(this.root ?? document, 'hud-score'), formatScore(score));
    void tokens;
  }
}
