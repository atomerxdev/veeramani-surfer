import { describe, expect, it } from 'vitest';
import { GameConfig } from '../../src/app/GameConfig';
import { StorageManager } from '../../src/core/StorageManager';
import {
  ScoreManager,
  computeScore,
  distancePoints,
  tokenPoints,
} from '../../src/gameplay/ScoreManager';
import { MemoryStorage } from './helpers';

function makeManager(): { manager: ScoreManager; storage: MemoryStorage } {
  const storage = new MemoryStorage();
  return { manager: new ScoreManager(new StorageManager(storage)), storage };
}

describe('score maths', () => {
  it('applies the documented distance and token values', () => {
    const config = GameConfig.scoring;
    expect(computeScore(100, 0)).toBe(100 * config.pointsPerMeter);
    expect(computeScore(0, 5)).toBe(5 * config.pointsPerToken);
    expect(computeScore(100, 5)).toBe(
      100 * config.pointsPerMeter + 5 * config.pointsPerToken,
    );
  });

  it('multiplies the whole score by the multiplier', () => {
    expect(computeScore(100, 10, 2)).toBe(computeScore(100, 10, 1) * 2);
  });

  it('never returns a negative score', () => {
    expect(computeScore(-50, -5)).toBe(0);
    expect(distancePoints(-10, 1)).toBe(0);
    expect(tokenPoints(-3, 1)).toBe(0);
  });

  it('clamps a multiplier below 1 up to 1', () => {
    expect(computeScore(10, 0, 0.5)).toBe(computeScore(10, 0, 1));
  });
});

describe('ScoreManager', () => {
  it('accumulates distance incrementally to the same total as the formula', () => {
    const { manager } = makeManager();
    for (let i = 0; i < 120; i += 1) manager.addDistance(1);
    expect(manager.score).toBe(computeScore(120, 0, 1));
    expect(manager.distance).toBe(120);
  });

  it('counts tokens and folds them into the score', () => {
    const { manager } = makeManager();
    manager.addDistance(50);
    manager.addTokens(3);
    expect(manager.tokens).toBe(3);
    expect(manager.score).toBe(computeScore(50, 3, 1));
  });

  it('applies the live multiplier as points are earned', () => {
    const { manager } = makeManager();
    manager.addDistance(20, 1);
    manager.addDistance(20, 2);
    expect(manager.score).toBe(20 + 40);
  });

  it('persists a finished run and detects a personal best', () => {
    const { manager } = makeManager();
    manager.addDistance(200);
    const first = manager.finish();
    expect(first.newBest).toBe(true);
    expect(first.best).toBe(first.score);

    manager.reset();
    manager.addDistance(10);
    const second = manager.finish();
    expect(second.newBest).toBe(false);
    expect(second.best).toBe(first.score);
  });

  it('resets score, distance and tokens between runs', () => {
    const { manager } = makeManager();
    manager.addDistance(100);
    manager.addTokens(4);
    manager.reset();
    expect(manager.score).toBe(0);
    expect(manager.distance).toBe(0);
    expect(manager.tokens).toBe(0);
  });

  it('keeps the best score readable after a reset', () => {
    const { manager } = makeManager();
    manager.addDistance(300);
    manager.finish();
    const best = manager.best;
    manager.reset();
    expect(manager.best).toBe(best);
    expect(manager.score).toBe(0);
  });
});
