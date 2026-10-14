/**
 * Main menu controller: best score / distance / run count, sound toggle,
 * and the runner nickname input field.
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
  private readonly playerNameInput = document.querySelector<HTMLInputElement>(
    '#menu-player-name',
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

  setPlayerName(name: string): void {
    if (this.playerNameInput) {
      this.playerNameInput.value = name;
    }
  }

  getPlayerName(): string {
    return this.playerNameInput?.value.trim() ?? '';
  }
}
