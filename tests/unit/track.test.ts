import { beforeEach, describe, expect, it } from 'vitest';
import { Group } from 'three';
import { GameConfig } from '../../src/app/GameConfig';
import { CollectibleManager } from '../../src/gameplay/CollectibleManager';
import { DifficultyManager } from '../../src/gameplay/DifficultyManager';
import { ObstacleManager } from '../../src/gameplay/ObstacleManager';
import { PowerUpManager } from '../../src/gameplay/PowerUpManager';
import { TrackManager } from '../../src/gameplay/TrackManager';
import { HAZARD_DEFINITIONS } from '../../src/gameplay/HazardCatalog';
import { speedForDistance } from '../../src/app/GameConfig';
import { qualityForTests } from './helpers';

const STEP = 1 / 60;
const SEGMENT = GameConfig.world.segmentLength;
const ACTIVE = GameConfig.world.activeSegments;

interface Harness {
  track: TrackManager;
  obstacles: ObstacleManager;
  collectibles: CollectibleManager;
  difficulty: DifficultyManager;
  obstacleRoot: Group;
  /** Simulate a run, returning the distance travelled. */
  run(seconds: number): number;
}

function makeHarness(seed: number): Harness {
  const root = new Group();
  const obstacleRoot = new Group();
  const obstacles = new ObstacleManager(obstacleRoot);
  const collectibles = new CollectibleManager(new Group());
  const powerUps = new PowerUpManager(new Group());
  const difficulty = new DifficultyManager();
  const track = new TrackManager({
    root,
    obstacles,
    collectibles,
    powerUps,
    difficulty,
    getQuality: () => qualityForTests,
  });
  track.reset(seed);

  let distance = 0;
  return {
    track,
    obstacles,
    collectibles,
    difficulty,
    obstacleRoot,
    run(seconds: number): number {
      const steps = Math.round(seconds / STEP);
      for (let i = 0; i < steps; i += 1) {
        const speed = speedForDistance(distance);
        distance += speed * STEP;
        difficulty.advance(STEP, distance);
        track.update(STEP, speed, distance);
        obstacles.update(STEP, speed);
        collectibles.update(STEP, speed, {
          playerCollider: {
            centerX: 0,
            centerY: -999,
            centerZ: 0,
            halfWidth: 0.05,
            halfHeight: 0.05,
            halfDepth: 0.05,
          },
          magnetActive: false,
          magnetRadius: 0,
          playerX: 0,
          playerY: 0,
        });
      }
      return distance;
    },
  };
}

describe('TrackManager streaming', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeHarness(20261013);
  });

  it('keeps a constant number of live segments', () => {
    expect(harness.track.liveSegmentCount).toBe(ACTIVE);
    harness.run(30);
    expect(harness.track.liveSegmentCount).toBe(ACTIVE);
  });

  it('lays segments out end to end with no gaps or overlaps', () => {
    for (const seconds of [0, 5, 20, 60]) {
      harness.run(seconds);
      const origins = [...harness.track.segmentOrigins].sort((a, b) => b - a);
      expect(origins).toHaveLength(ACTIVE);
      for (let i = 1; i < origins.length; i += 1) {
        const gap = (origins[i - 1] as number) - (origins[i] as number);
        expect(gap).toBeCloseTo(SEGMENT, 3);
      }
      // The nearest edge never drifts past the recycling line...
      expect(origins[0] as number).toBeLessThan(GameConfig.world.recycleZ + SEGMENT);
      // ...and the road always covers the whole visible range ahead.
      expect((origins[origins.length - 1] as number) - SEGMENT * 2).toBeLessThan(-100);
    }
  });

  it('starts a run with road already behind the player, under the camera', () => {
    // The follow camera sits camera.offsetZ in front of the player. If the near
    // segment edge starts flush with the player, the first frames of a run look
    // at empty sky until the street scrolls forward to catch up.
    expect(GameConfig.world.startBehindZ).toBeGreaterThan(GameConfig.camera.offsetZ);

    const origins = [...harness.track.segmentOrigins].sort((a, b) => b - a);
    const nearest = origins[0] as number;
    expect(nearest).toBeGreaterThanOrEqual(GameConfig.camera.offsetZ);
    // ...and the nearest segment still reaches back past the player.
    expect(nearest - SEGMENT).toBeLessThanOrEqual(0);
  });

  it('never spawns hazards on top of the player', () => {
    for (let i = 0; i < 40; i += 1) {
      harness.track.reset(i);
      for (const hazard of harness.obstacles.active) {
        expect(hazard.z).toBeLessThanOrEqual(-50);
      }
    }
  });

  it('recycles objects instead of allocating without bound', () => {
    // Warm the per-kind pools first, then check the object count plateaus.
    harness.run(60);
    const afterWarmup = harness.obstacleRoot.children.length;
    const pooledAfterWarmup = harness.obstacles.pooledCount;
    harness.run(300);
    const afterLongRun = harness.obstacleRoot.children.length;

    // Objects really are being returned to the pools...
    expect(pooledAfterWarmup).toBeGreaterThan(0);
    // ...and the total created stays bounded rather than tracking distance.
    expect(afterLongRun).toBeLessThanOrEqual(afterWarmup + 20);
    expect(afterLongRun).toBeLessThanOrEqual(80);
    expect(harness.obstacles.count).toBeLessThan(40);
  });

  it('keeps the live hazard count bounded', () => {
    harness.run(120);
    expect(harness.obstacles.count).toBeLessThan(40);
  });

  it('produces exactly the same track for the same seed', () => {
    const a = makeHarness(777);
    const b = makeHarness(777);
    const samples: string[][] = [];
    for (const h of [a, b]) {
      const frames: string[] = [];
      for (let i = 0; i < 20; i += 1) {
        h.run(1);
        frames.push(
          h.obstacles.active
            .map((hazard) => `${hazard.kind}@${hazard.lane}:${hazard.z.toFixed(3)}`)
            .sort()
            .join(','),
        );
      }
      samples.push(frames);
    }
    expect(samples[0]).toEqual(samples[1]);
  });

  it('produces a different track for a different seed', () => {
    const a = makeHarness(1);
    const b = makeHarness(2);
    a.run(30);
    b.run(30);
    const signature = (h: Harness) =>
      h.obstacles.active.map((hazard) => `${hazard.kind}@${hazard.lane}`).sort().join(',');
    expect(signature(a)).not.toBe(signature(b));
  });

  it('never generates an unavoidable row over a long run', () => {
    for (const seconds of [10, 45, 120]) {
      const local = makeHarness(4242);
      local.run(seconds);
      const rows = new Map<string, { lane: number; kind: keyof typeof HAZARD_DEFINITIONS }[]>();
      for (const hazard of local.obstacles.active) {
        const key = hazard.z.toFixed(1);
        const row = rows.get(key) ?? [];
        row.push({ lane: hazard.lane, kind: hazard.kind });
        rows.set(key, row);
      }
      for (const row of rows.values()) {
        const lanes = new Set(row.map((item) => item.lane));
        if (lanes.size < GameConfig.world.laneCount) continue;
        const actions = new Set(row.map((item) => HAZARD_DEFINITIONS[item.kind].action));
        expect(actions.size).toBe(1);
      }
    }
  });

  it('clears and re-rolls the road on reset', () => {
    harness.run(60);
    harness.track.reset(99);
    expect(harness.track.seedValue).toBe(99);
    expect(harness.obstacles.count).toBeGreaterThan(0);
    for (const hazard of harness.obstacles.active) {
      expect(hazard.z).toBeLessThanOrEqual(-50);
    }
  });

  it('never leaves the road empty for longer than a segment plus one spacing', () => {
    // Design bound: rows sit on a spacing grid that may be deferred across one
    // segment seam, so the worst case is one segment plus one reaction spacing.
    const speed = speedForDistance(harness.run(90));
    const spacing = speed * GameConfig.difficulty.minReactionTime;
    const zs = harness.obstacles.active.map((hazard) => hazard.z).sort((a, b) => b - a);
    expect(zs.length).toBeGreaterThan(3);
    for (let i = 1; i < zs.length; i += 1) {
      const gap = (zs[i - 1] as number) - (zs[i] as number);
      expect(gap).toBeLessThanOrEqual(SEGMENT + spacing + 0.5);
    }
  });
});
