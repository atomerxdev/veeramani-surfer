import { describe, expect, it } from 'vitest';
import { GameConfig, speedForDistance, tierForDistance } from '../../src/app/GameConfig';
import { createRandom } from '../../src/core/Random';
import { DifficultyManager } from '../../src/gameplay/DifficultyManager';
import { HAZARD_DEFINITIONS } from '../../src/gameplay/HazardCatalog';

const SEGMENT_LENGTH = GameConfig.world.segmentLength;

function generateManySegments(seed: number, count: number, distance: number) {
  const difficulty = new DifficultyManager();
  const random = createRandom(seed);
  const segments = [];
  for (let i = 0; i < count; i += 1) {
    difficulty.advance(1, distance);
    segments.push(
      difficulty.generateSegmentContent(random, {
        segmentLength: SEGMENT_LENGTH,
        laneCount: GameConfig.world.laneCount,
        startOffset: -(SEGMENT_LENGTH - 2),
        allowPowerUp: true,
      }),
    );
  }
  return segments;
}

/**
 * Same generation, but placed on the track like the real manager does: segment i
 * sits `SEGMENT_LENGTH` metres further away than segment i-1, and the first two
 * segments of a run are left clear. Returns world-space hazard rows.
 */
function generateWorldRows(seed: number, count: number, distance: number): number[] {
  const difficulty = new DifficultyManager();
  const random = createRandom(seed);
  const worldZs: number[] = [];
  for (let i = 0; i < count; i += 1) {
    difficulty.advance(1, distance);
    const origin = -(i + 2) * SEGMENT_LENGTH;
    const content = difficulty.generateSegmentContent(random, {
      segmentLength: SEGMENT_LENGTH,
      laneCount: GameConfig.world.laneCount,
      startOffset: -(SEGMENT_LENGTH - 2),
      allowPowerUp: false,
    });
    for (const hazard of content.hazards) {
      const worldZ = Math.round((origin + hazard.z) * 100) / 100;
      if (!worldZs.includes(worldZ)) worldZs.push(worldZ);
    }
  }
  return worldZs;
}

describe('speed and tier ramps', () => {
  it('starts at the base speed and never exceeds the maximum', () => {
    expect(speedForDistance(0)).toBeCloseTo(GameConfig.difficulty.baseSpeed, 5);
    expect(speedForDistance(100_000)).toBe(GameConfig.difficulty.maxSpeed);
  });

  it('increases monotonically with distance', () => {
    let previous = speedForDistance(0);
    for (let distance = 0; distance <= 2000; distance += 50) {
      const speed = speedForDistance(distance);
      expect(speed).toBeGreaterThanOrEqual(previous);
      previous = speed;
    }
  });

  it('caps the tier', () => {
    expect(tierForDistance(0)).toBe(0);
    expect(tierForDistance(GameConfig.difficulty.tierDistance)).toBe(1);
    expect(tierForDistance(1e9)).toBe(GameConfig.difficulty.maxTier);
  });
});

describe('crash pressure and recovery', () => {
  it('survives one crash and ends the run on a close second', () => {
    const difficulty = new DifficultyManager();
    const first = difficulty.registerCrash();
    expect(first.gameOver).toBe(false);
    expect(first.pressure).toBeGreaterThan(0);

    // Surviving long enough to fully recover means the next crash is survivable.
    for (let i = 0; i < 60 * 4; i += 1) difficulty.advance(1 / 60, 0);
    expect(difficulty.pressure).toBe(0);

    const second = difficulty.registerCrash();
    expect(second.gameOver).toBe(false);
  });

  it('ends the run when a second crash lands inside the recovery window', () => {
    const difficulty = new DifficultyManager();
    difficulty.registerCrash();
    // ~1 second later (the invulnerability window) rather than minutes.
    for (let i = 0; i < 60; i += 1) difficulty.advance(1 / 60, 0);
    const second = difficulty.registerCrash();
    expect(second.gameOver).toBe(true);
    expect(difficulty.pressure).toBeGreaterThanOrEqual(GameConfig.difficulty.gameOverPressure);
  });

  it('reports recovery once pressure has decayed', () => {
    const difficulty = new DifficultyManager();
    difficulty.registerCrash();
    expect(difficulty.hasRecovered).toBe(false);
    for (let i = 0; i < 60 * 4; i += 1) difficulty.advance(1 / 60, 0);
    expect(difficulty.hasRecovered).toBe(true);
  });
});

describe('segment content generation', () => {
  it('is deterministic for a given seed', () => {
    const a = generateManySegments(4242, 8, 400);
    const b = generateManySegments(4242, 8, 400);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('differs between seeds', () => {
    const a = generateManySegments(1, 6, 400);
    const b = generateManySegments(987654, 6, 400);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('never blocks all three lanes with un-passable hazards', () => {
    for (const distance of [0, 150, 400, 900, 2500]) {
      for (const segment of generateManySegments(7, 12, distance)) {
        // Group hazards into rows by their z offset.
        const rows = new Map<number, typeof segment.hazards>();
        for (const hazard of segment.hazards) {
          const key = Math.round(hazard.z * 10) / 10;
          const row = rows.get(key) ?? [];
          row.push(hazard);
          rows.set(key, row);
        }
        for (const row of rows.values()) {
          const lanes = new Set(row.map((hazard) => hazard.lane));
          if (lanes.size < GameConfig.world.laneCount) continue;
          const actions = new Set(row.map((hazard) => HAZARD_DEFINITIONS[hazard.kind].action));
          expect(actions.size).toBe(1);
          const action = [...actions][0];
          expect(action === 'jump' || action === 'slide').toBe(true);
        }
      }
    }
  });

  it('spaces hazard rows by at least the minimum reaction window', () => {
    const minReaction = GameConfig.difficulty.minReactionTime;
    for (const distance of [0, 500, 1500, 4000]) {
      const speed = speedForDistance(distance);
      const rows = generateWorldRows(31, 12, distance).sort((a, b) => b - a);
      expect(rows.length).toBeGreaterThan(5);
      for (let i = 1; i < rows.length; i += 1) {
        const gap = (rows[i - 1] as number) - (rows[i] as number);
        expect(gap).toBeGreaterThanOrEqual(speed * minReaction - 0.02);
      }
    }
  });

  it('keeps every hazard inside the segment', () => {
    for (const segment of generateManySegments(99, 10, 300)) {
      for (const hazard of segment.hazards) {
        expect(hazard.z).toBeLessThanOrEqual(0);
        expect(hazard.z).toBeGreaterThanOrEqual(-SEGMENT_LENGTH);
        expect(hazard.lane).toBeGreaterThanOrEqual(0);
        expect(hazard.lane).toBeLessThan(GameConfig.world.laneCount);
      }
      for (const token of segment.tokens) {
        expect(token.z).toBeLessThanOrEqual(0);
        expect(token.z).toBeGreaterThanOrEqual(-SEGMENT_LENGTH + -2);
      }
    }
  });

  it('never places tokens on top of a hazard lane at the same z', () => {
    for (const segment of generateManySegments(5150, 12, 600)) {
      for (const token of segment.tokens) {
        for (const hazard of segment.hazards) {
          const overlapping = Math.abs(hazard.z - token.z) < 2.2 && hazard.lane === token.lane;
          expect(overlapping).toBe(false);
        }
      }
    }
  });

  it('unlocks more hazard types as the tier rises', () => {
    const early = generateManySegments(3, 8, 0).flatMap((segment) => segment.hazards);
    const late = generateManySegments(3, 8, 1200).flatMap((segment) => segment.hazards);
    expect(early.length).toBeGreaterThan(0);
    expect(late.length).toBeGreaterThan(0);
    // Slide barriers need tier >= 1, so they must not appear at the very start.
    expect(early.every((hazard) => HAZARD_DEFINITIONS[hazard.kind].minTier === 0)).toBe(true);
  });
});
