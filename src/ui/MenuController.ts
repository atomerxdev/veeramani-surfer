/**
 * Main menu controller: best score / distance / run count, and the sound toggle.
 * Buttons themselves are wired by UIManager's delegated click handler.
 */

import type { StoredProfile } from '../core/StorageManager';
import { bindTarget, formatDistance, formatScore, setTextIfChanged } from './Dom';

export class MenuController {
  private readonly bestScore = bindTarget(document, 'menu-best-score');
  private readonly bestDistance = bindTarget(document, 'menu-best-distance');
  private readonly runs = bindTarget(document, 'menu-runs');
  private readonly muteButton = document.querySelector<HTMLButtonElement>(
    '[data-action="toggle-mute"]',
  );

  sync(profile: StoredProfile): void {
    setTextIfChanged(this.bestScore, formatScore(profile.bestScore));
    setTextIfChanged(this.bestDistance, formatDistance(profile.bestDistance));
    setTextIfChanged(this.runs, formatScore(profile.runs));
    this.setMuted(!profile.settings.sound);
  }

  setMuted(muted: boolean): void {
    if (!this.muteButton) return;
    this.muteButton.textContent = muted ? 'Sound: off' : 'Sound: on';
    this.muteButton.setAttribute('aria-pressed', String(muted));
  }
}
