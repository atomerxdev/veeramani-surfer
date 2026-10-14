/**
 * Game-over summary: final score, distance, tokens, best score, the new-record
 * flourish, and automatic leaderboard save confirmation.
 */

import type { RunResult } from '../gameplay/ScoreManager';
import { bindTarget, formatDistance, formatScore, setTextIfChanged } from './Dom';

export interface GameOverSummary extends RunResult {
  /** Human-readable reason, e.g. "The riders caught up." */
  readonly reason: string;
}

export class GameOverController {
  private readonly root = document.querySelector<HTMLElement>('[data-screen="gameover"]');
  private readonly title = bindTarget(document, 'gameover-title');
  private readonly reason = bindTarget(document, 'gameover-reason');
  private readonly score = bindTarget(document, 'gameover-score');
  private readonly distance = bindTarget(document, 'gameover-distance');
  private readonly tokens = bindTarget(document, 'gameover-tokens');
  private readonly best = bindTarget(document, 'gameover-best');
  private readonly record = bindTarget(document, 'gameover-record');
  private readonly autosaveBox = bindTarget(document, 'gameover-autosave-box');
  private readonly autosaveIcon = bindTarget(document, 'gameover-autosave-icon');
  private readonly autosaveText = bindTarget(document, 'gameover-autosave-text');

  get element(): HTMLElement | null {
    return this.root;
  }

  show(summary: GameOverSummary): void {
    setTextIfChanged(this.title, summary.newBest ? 'New record!' : 'Run over!');
    setTextIfChanged(this.reason, summary.reason);
    setTextIfChanged(this.score, formatScore(summary.score));
    setTextIfChanged(this.distance, formatDistance(summary.distance));
    setTextIfChanged(this.tokens, formatScore(summary.tokens));
    setTextIfChanged(this.best, formatScore(summary.best));
    if (this.record) this.record.hidden = !summary.newBest;
  }

  showSaving(playerName: string): void {
    if (this.autosaveBox) this.autosaveBox.hidden = false;
    if (this.autosaveIcon) this.autosaveIcon.textContent = '⏳';
    if (this.autosaveText) {
      this.autosaveText.textContent = `Saving score as ${playerName}...`;
      this.autosaveText.className = 'leaderboard-autosave__text is-saving';
    }
  }

  showSaved(text: string, isSuccess = true): void {
    if (this.autosaveBox) this.autosaveBox.hidden = false;
    if (this.autosaveIcon) this.autosaveIcon.textContent = isSuccess ? '🏆' : '⚠️';
    if (this.autosaveText) {
      this.autosaveText.textContent = text;
      this.autosaveText.className = isSuccess
        ? 'leaderboard-autosave__text is-success'
        : 'leaderboard-autosave__text is-warning';
    }
  }

  /** For compatibility */
  setPlayerName(_name: string): void {}
}
