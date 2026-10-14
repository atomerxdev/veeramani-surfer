/**
 * Gameplay HUD: score, best, tokens, active power-up badges and chase pressure.
 *
 * Updates are diffed against the last written values and throttled by the caller,
 * so the HUD costs almost nothing per frame and never triggers layout thrash.
 */

import type { ActivePowerUp, PowerUpKind } from '../gameplay/PowerUpManager';
import { POWER_UP_LABELS } from '../gameplay/PowerUpManager';
import { bindTarget, formatScore, formatSeconds, setTextIfChanged } from './Dom';

export class HUDController {
  private readonly score = bindTarget(document, 'hud-score');
  private readonly best = bindTarget(document, 'hud-best');
  private readonly tokens = bindTarget(document, 'hud-tokens');
  private readonly badgesRoot = bindTarget(document, 'hud-badges');
  private readonly pressureRoot = bindTarget(document, 'hud-pressure');
  private readonly pressureFill = document.querySelector<HTMLElement>('.hud__pressure-fill');

  private lastScore = -1;
  private lastBest = -1;
  private lastTokens = -1;
  private lastBadgeKey = '';
  private lastPressure = -1;

  setScore(score: number): void {
    const rounded = Math.floor(score);
    if (rounded === this.lastScore) return;
    this.lastScore = rounded;
    setTextIfChanged(this.score, formatScore(rounded));
  }

  setBest(best: number): void {
    if (best === this.lastBest) return;
    this.lastBest = best;
    setTextIfChanged(this.best, formatScore(best));
  }

  setTokens(count: number): void {
    if (count === this.lastTokens) return;
    this.lastTokens = count;
    setTextIfChanged(this.tokens, formatScore(count));
  }

  setBadges(active: readonly ActivePowerUp[]): void {
    const key = active.map((item) => `${item.kind}:${Math.ceil(item.remaining)}`).join('|');
    if (key === this.lastBadgeKey) return;
    this.lastBadgeKey = key;
    if (!this.badgesRoot) return;
    this.badgesRoot.replaceChildren(
      ...active.map((item) => this.buildBadge(item.kind, item.remaining)),
    );
  }

  setPressure(pressure: number): void {
    const clamped = Math.min(1, Math.max(0, pressure));
    if (Math.abs(clamped - this.lastPressure) < 0.02) return;
    this.lastPressure = clamped;
    if (this.pressureFill) this.pressureFill.style.width = `${Math.round(clamped * 100)}%`;
    this.pressureRoot?.classList.toggle('is-hot', clamped > 0.08);
  }

  reset(): void {
    this.lastScore = -1;
    this.lastBest = -1;
    this.lastTokens = -1;
    this.lastBadgeKey = '';
    this.lastPressure = -1;
    this.badgesRoot?.replaceChildren();
    this.pressureRoot?.classList.remove('is-hot');
  }

  private buildBadge(kind: PowerUpKind, remaining: number): HTMLElement {
    const badge = document.createElement('div');
    badge.className = `badge badge--${kind}`;
    const dot = document.createElement('span');
    dot.className = 'badge__dot';
    const label = document.createElement('span');
    label.textContent = POWER_UP_LABELS[kind];
    const time = document.createElement('span');
    time.className = 'badge__time';
    time.textContent = formatSeconds(remaining);
    badge.append(dot, label, time);
    return badge;
  }
}
