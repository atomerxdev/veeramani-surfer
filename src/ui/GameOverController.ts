/**
 * Game-over summary: final score, distance, tokens, best score and the new-record
 * flourish. Every field is written from the run result, so a stale value can never
 * survive into the next run.
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
}
