/**
 * Track manager.
 *
 * Streams market segments toward the player and recycles them behind the camera.
 * A segment that passes `recycleZ` is released (hazards and pickups owned by it
 * are returned to their pools), moved to the far end of the track, re-rolled for
 * a fresh look and refilled with new content from the seeded RNG.
 *
 * Because content is only ever generated for segments sitting `spawnSafeZ` or
 * more metres ahead of the player, an obstacle can never appear on top of them,
 * and the first two segments of a fresh run are always left clear so a run never
 * starts with an unavoidable collision.
 *
 * On reset the whole layout is shifted back by `world.startBehindZ`, so the road
 * already reaches past the follow camera on the very first frame. Without that
 * head start the near segments start flush with the player and the camera looks
 * at empty sky until the street has scrolled forward to catch up.
 */

import type { Group } from 'three';
import { GameConfig, type GameConfigShape, type QualityProfile } from '../app/GameConfig';
import { createRandom, type RandomSource } from '../core/Random';
import { MarketSegment } from '../world/MarketSegment';
import { MarketBuilder } from '../world/MarketBuilder';
import type { CollectibleManager } from './CollectibleManager';
import type { DifficultyManager } from './DifficultyManager';
import type { ObstacleManager } from './ObstacleManager';
import type { PowerUpManager } from './PowerUpManager';

export interface TrackManagerDeps {
  readonly root: Group;
  readonly config?: GameConfigShape;
  readonly obstacles: ObstacleManager;
  readonly collectibles: CollectibleManager;
  readonly powerUps: PowerUpManager;
  readonly difficulty: DifficultyManager;
  readonly getQuality: () => QualityProfile;
}

/** Segments closer to the player than this are never given hazards. */
const SPAWN_SAFE_DISTANCE = 52;

export class TrackManager {
  private readonly config: GameConfigShape;
  private readonly builder: MarketBuilder;
  private segments: MarketSegment[] = [];
  private random: RandomSource;
  private distanceSincePowerUp = 0;
  private powerUpReady = false;
  private seed: number;
  private hazardSpawnEnabled = true;

  constructor(private readonly deps: TrackManagerDeps) {
    this.config = deps.config ?? GameConfig;
    this.builder = new MarketBuilder(this.config);
    this.seed = this.config.world.defaultSeed;
    this.random = createRandom(this.seed);
  }

  setHazardSpawnEnabled(enabled: boolean): void {
    this.hazardSpawnEnabled = enabled;
  }

  get isHazardSpawnEnabled(): boolean {
    return this.hazardSpawnEnabled;
  }

  /** Total metres of street currently alive (diagnostics/tests). */
  get liveSegmentCount(): number {
    return this.segments.length;
  }

  /** Near-edge Z of every segment, nearest first (diagnostics/tests). */
  get segmentOrigins(): number[] {
    return this.segments.map((segment) => segment.originZ);
  }

  get worldRoot(): Group {
    return this.deps.root;
  }

  reset(seed: number = this.config.world.defaultSeed): void {
    this.seed = seed;
    this.random = createRandom(seed);
    this.distanceSincePowerUp = 0;
    this.powerUpReady = false;
    this.hazardSpawnEnabled = true;

    this.deps.obstacles.reset();
    this.deps.collectibles.reset();
    this.deps.powerUps.clear();

    const quality = this.deps.getQuality();
    if (this.segments.length === 0) this.buildSegments();

    this.segments.forEach((segment, index) => {
      segment.setOrigin(this.config.world.startBehindZ - index * this.config.world.segmentLength);
      segment.randomize(this.random, quality.propDensity);
      if (segment.originZ <= -SPAWN_SAFE_DISTANCE) this.fill(segment);
    });
  }

  private buildSegments(): void {
    const quality = this.deps.getQuality();
    for (let index = 0; index < this.config.world.activeSegments; index += 1) {
      const segment = this.builder.createSegment(index, this.random, quality);
      this.deps.root.add(segment.group);
      this.segments.push(segment);
    }
  }

  update(dt: number, speed: number, distance: number): void {
    const quality = this.deps.getQuality();

    // Power-up pacing is measured in metres travelled.
    if (
      !this.powerUpReady &&
      distance >= this.config.difficulty.powerUpStartDistance &&
      this.distanceSincePowerUp >= this.config.powerUps.spawnInterval
    ) {
      this.powerUpReady = true;
      this.distanceSincePowerUp = 0;
    }
    this.distanceSincePowerUp += speed * dt;

    const stride = this.config.world.segmentLength * this.config.world.activeSegments;
    for (const segment of this.segments) {
      segment.setOrigin(segment.originZ + speed * dt);
      if (segment.originZ >= this.config.world.recycleZ) {
        this.release(segment);
        segment.setOrigin(segment.originZ - stride);
        segment.randomize(this.random, quality.propDensity);
        this.fill(segment);
      }
    }
  }

  /** Return every pooled object owned by a segment before it is re-rolled. */
  private release(segment: MarketSegment): void {
    this.deps.obstacles.releaseByOwner(segment.index);
    this.deps.collectibles.releaseByOwner(segment.index);
    this.deps.powerUps.releaseByOwner(segment.index);
  }

  private fill(segment: MarketSegment): void {
    const quality = this.deps.getQuality();
    const allowPowerUp = this.powerUpReady && quality.propDensity > 0;
    const content = this.deps.difficulty.generateSegmentContent(this.random, {
      segmentLength: segment.length,
      laneCount: this.config.world.laneCount,
      startOffset: -(segment.length - 2),
      allowPowerUp,
    });

    const origin = segment.originZ;
    if (this.hazardSpawnEnabled) {
      for (const hazard of content.hazards) {
        this.deps.obstacles.spawn(hazard.kind, hazard.lane, origin + hazard.z, segment.index);
      }
    }
    for (const token of content.tokens) {
      this.deps.collectibles.spawn(token.lane, origin + token.z, segment.index);
    }
    if (content.powerUp) {
      this.deps.powerUps.spawn(
        content.powerUp.kind,
        content.powerUp.lane,
        origin + content.powerUp.z,
        segment.index,
      );
      this.powerUpReady = false;
    }
  }

  get seedValue(): number {
    return this.seed;
  }

  dispose(): void {
    for (const segment of this.segments) {
      this.deps.root.remove(segment.group);
      segment.dispose();
    }
    this.segments = [];
  }
}
