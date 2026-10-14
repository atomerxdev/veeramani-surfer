/**
 * Difficulty manager.
 *
 * Two responsibilities:
 *   1. The speed / tier ramp and the chase-pressure bookkeeping that decides when
 *      a run ends.
 *   2. Generating one segment's worth of hazard + token layout from a seeded RNG.
 *
 * The generator owns the "no impossible layouts" guarantee. It never fills all
 * three lanes with un-jumpable, un-slidable blockers, and it spaces hazard rows
 * by at least `speed * minReactionTime` metres so the player always gets the
 * documented minimum reaction window, even at maximum speed.
 */

import {
  GameConfig,
  speedForDistance,
  tierForDistance,
  type GameConfigShape,
} from '../app/GameConfig';
import type { RandomSource } from '../core/Random';
import { HAZARD_DEFINITIONS, HAZARD_KINDS, type HazardAction, type HazardKind } from './HazardCatalog';
import type { PowerUpKind } from './PowerUpManager';

export interface HazardSlot {
  readonly kind: HazardKind;
  readonly lane: number;
  /** Offset from the segment's near edge, always <= 0. */
  readonly z: number;
}

export interface TokenSlot {
  readonly lane: number;
  readonly z: number;
}

export interface PowerUpSlot {
  readonly kind: PowerUpKind;
  readonly lane: number;
  readonly z: number;
}

export interface SegmentContent {
  readonly hazards: HazardSlot[];
  readonly tokens: TokenSlot[];
  readonly powerUp: PowerUpSlot | null;
}

export interface GenerateOptions {
  /** Segment length in metres. */
  readonly segmentLength: number;
  readonly laneCount: number;
  /** Local Z at which generation may start (usually -(segmentLength - 2)). */
  readonly startOffset: number;
  /** Allow a power-up pick-up inside this segment. */
  readonly allowPowerUp: boolean;
}

const PASSABLE_ACTIONS: readonly HazardAction[] = ['jump', 'slide'];

export class DifficultyManager {
  private travelledDistance = 0;
  private pressureValue = 0;
  private tierValue = 0;
  private speedValue: number;
  /** Marks the last generated row so segments do not butt up against each other. */
  private lastRowLocalZ = 0;
  private hasPendingRow = false;

  constructor(private readonly config: GameConfigShape = GameConfig) {
    this.speedValue = config.difficulty.baseSpeed;
  }

  /* ------------------------------------------------------------ progression */

  get distance(): number {
    return this.travelledDistance;
  }

  get speed(): number {
    return this.speedValue;
  }

  get tier(): number {
    return this.tierValue;
  }

  /** 0..1 chase pressure. The riders use it to set their distance. */
  get pressure(): number {
    return Math.min(1, Math.max(0, this.pressureValue));
  }

  get maxSpeed(): number {
    return this.config.difficulty.maxSpeed;
  }

  reset(): void {
    this.travelledDistance = 0;
    this.pressureValue = 0;
    this.tierValue = 0;
    this.speedValue = this.config.difficulty.baseSpeed;
    this.lastRowLocalZ = 0;
    this.hasPendingRow = false;
  }

  /** Advance distance-based ramps and decay chase pressure. */
  advance(dt: number, distance: number): void {
    this.travelledDistance = Math.max(0, distance);
    this.speedValue = speedForDistance(this.travelledDistance, this.config);
    this.tierValue = tierForDistance(this.travelledDistance, this.config);
    this.pressureValue = Math.max(
      0,
      this.pressureValue - this.config.difficulty.pressureDecayPerSecond * dt,
    );
  }

  /**
   * Register a crash. Chase pressure rises; if it crosses the configured
   * threshold the run is over (two crashes inside the recovery window).
   */
  registerCrash(): { gameOver: boolean; pressure: number } {
    this.pressureValue = Math.min(1, this.pressureValue + this.config.difficulty.crashPressure);
    return {
      gameOver: this.pressureValue >= this.config.difficulty.gameOverPressure,
      pressure: this.pressureValue,
    };
  }

  /** Riders have fallen back: pressure is low enough to be "safe" again. */
  get hasRecovered(): boolean {
    return this.pressureValue < this.config.difficulty.gameOverPressure * 0.5;
  }

  /** Forward speed including a temporary power-up bonus. */
  speedWith(bonus: number): number {
    return Math.min(this.config.difficulty.maxSpeed + 4, this.speedValue + bonus);
  }

  /** Minimum spacing between hazard rows at the current speed. */
  get rowSpacing(): number {
    return Math.max(9, this.speedValue * this.config.difficulty.minReactionTime);
  }

  /* --------------------------------------------------------- pattern building */

  /**
   * Build one segment of content. Deterministic for a given RNG state, which is
   * what makes the seeded track reproducible in tests.
   */
  generateSegmentContent(random: RandomSource, options: GenerateOptions): SegmentContent {
    const { segmentLength, laneCount, startOffset } = options;
    const hazards: HazardSlot[] = [];
    const tokens: TokenSlot[] = [];
    const tier = this.tierValue;
    const spacing = this.rowSpacing;

    // Rows are laid out on a spacing grid that starts at the far end of the
    // segment and walks toward the near edge.
    const segmentNearEdge = 0;
    let z = startOffset;

    // If the previous segment ended with a row very close to the shared boundary,
    // defer this segment's first grid slots so the minimum reaction window is
    // respected across the seam. Deferred slots must stay outside the segment
    // (they are simply skipped) - never place a row beyond `startOffset`.
    if (this.hasPendingRow) {
      const distanceFromLastRow = segmentLength + startOffset - this.lastRowLocalZ;
      const deficit = spacing - distanceFromLastRow;
      if (deficit > 0) z -= deficit;
    }

    let placed = 0;
    let guard = 0;
    const maxRows = Math.max(1, Math.floor(segmentLength / spacing) + 1);

    while (z < segmentNearEdge - 4 && placed < maxRows && guard < 32) {
      guard += 1;
      if (z < startOffset) {
        // Still inside the deferred zone: keep walking the grid.
        z += spacing;
        continue;
      }
      const row = this.buildRow(random, tier, laneCount);
      if (row.hazards.length > 0) {
        for (const hazard of row.hazards) {
          hazards.push({ kind: hazard.kind, lane: hazard.lane, z });
        }
        // Reward line: tokens in one of the lanes the player can safely use.
        const freeLanes = row.freeLanes;
        if (freeLanes.length > 0 && random.chance(0.72)) {
          const lane = random.pick(freeLanes);
          const runLength = random.int(1, 3);
          for (let i = 0; i < runLength; i += 1) {
            const tokenZ = z + i * 2.1;
            if (tokenZ > segmentNearEdge - 3) break;
            tokens.push({ lane, z: tokenZ });
          }
        }
        this.lastRowLocalZ = z;
        this.hasPendingRow = true;
        placed += 1;
      }
      z += spacing;
    }

    // Power-up placement: try a few candidate offsets near the near edge of the
    // segment and take the first one whose lane is actually clear. Rejection here
    // is fine - the manager simply tries again next segment.
    let powerUp: PowerUpSlot | null = null;
    if (options.allowPowerUp) {
      const candidates = Math.max(6, spacing * 0.5);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidateZ = -candidates - attempt * candidates;
        if (candidateZ <= startOffset) break;
        const freeLane = this.pickFreeLane(random, laneCount, hazards, candidateZ);
        if (freeLane === null) continue;
        powerUp = { kind: this.pickPowerUpKind(random), lane: freeLane, z: candidateZ };
        break;
      }
    }

    return { hazards, tokens, powerUp };
  }

  /** One row of hazards plus the lanes left open by that row. */
  private buildRow(
    random: RandomSource,
    tier: number,
    laneCount: number,
  ): { hazards: { kind: HazardKind; lane: number }[]; freeLanes: number[]; action: HazardAction | null } {
    // How many lanes to fill: ramps from 1 to laneCount-1, and only reaches the
    // full width for rows that a single action can solve (all jump or all slide).
    const maxBlocked = Math.min(laneCount - (tier >= 3 ? 1 : 2), laneCount - 1);
    const blockedCount = Math.max(1, random.int(1, Math.max(1, maxBlocked)));

    const lanes = shuffled(random, laneCount).slice(0, blockedCount);
    const fullWidthRow = blockedCount === laneCount;
    const action = this.pickAction(random, tier);

    const hazards = lanes.map((lane) => ({
      kind: fullWidthRow
        ? random.pick(this.kindsForActions(PASSABLE_ACTIONS, tier))
        : random.pick(this.kindsForActions([action], tier)),
      lane,
    }));

    // On a full-width row every hazard must share the same passable action.
    if (fullWidthRow) {
      const forcedAction = random.pick(PASSABLE_ACTIONS);
      const kinds = this.kindsForActions([forcedAction], tier);
      const forcedKind = random.pick(kinds);
      for (const hazard of hazards) hazard.kind = forcedKind;
    } else if (this.isUnsolvable(hazards, tier)) {
      // Defensive: fall back to a single lane blocker if a combination slipped through.
      hazards.length = 0;
      hazards.push({ kind: 'crateStack', lane: lanes[0] as number });
    }

    const freeLanes: number[] = [];
    for (let lane = 0; lane < laneCount; lane += 1) {
      if (!hazards.some((hazard) => hazard.lane === lane)) freeLanes.push(lane);
    }
    return { hazards, freeLanes, action };
  }

  /**
   * A row is unsolvable if every lane is blocked and the blocked lanes do not all
   * accept the same action (jump *and* slide in one row cannot be done at once).
   */
  private isUnsolvable(hazards: { kind: HazardKind; lane: number }[], _tier: number): boolean {
    void _tier;
    if (hazards.length < 3) return false;
    const actions = new Set(hazards.map((hazard) => HAZARD_DEFINITIONS[hazard.kind].action));
    if (actions.size === 1) {
      const only = [...actions][0];
      return !PASSABLE_ACTIONS.includes(only);
    }
    return true;
  }

  private pickAction(random: RandomSource, tier: number): HazardAction {
    const weights: { action: HazardAction; weight: number }[] = [
      { action: 'laneChange', weight: 3 },
      { action: 'avoid', weight: 2 },
      { action: 'jump', weight: 2 },
      { action: 'slide', weight: tier >= 1 ? 2 : 0 },
    ];
    let total = 0;
    for (const entry of weights) total += entry.weight;
    let roll = random.next() * total;
    for (const entry of weights) {
      roll -= entry.weight;
      if (roll <= 0) return entry.action;
    }
    return 'laneChange';
  }

  private kindsForActions(actions: readonly HazardAction[], tier: number): HazardKind[] {
    const kinds = HAZARD_KINDS.filter((kind) => {
      const definition = HAZARD_DEFINITIONS[kind];
      return actions.includes(definition.action) && definition.minTier <= tier;
    });
    if (kinds.length > 0) return kinds;
    // Fallback so early tiers always have something legal to place.
    return HAZARD_KINDS.filter((kind) => HAZARD_DEFINITIONS[kind].minTier <= tier);
  }

  private pickFreeLane(
    random: RandomSource,
    laneCount: number,
    hazards: readonly HazardSlot[],
    nearZ: number,
  ): number | null {
    const blocked = new Set(
      hazards.filter((hazard) => Math.abs(hazard.z - nearZ) < 6).map((hazard) => hazard.lane),
    );
    const free: number[] = [];
    for (let lane = 0; lane < laneCount; lane += 1) if (!blocked.has(lane)) free.push(lane);
    if (free.length === 0) return null;
    return random.pick(free);
  }

  private pickPowerUpKind(random: RandomSource): PowerUpKind {
    const roll = random.next();
    if (roll < 0.3) return 'shield';
    if (roll < 0.55) return 'magnet';
    if (roll < 0.8) return 'multiplier';
    return 'boost';
  }
}

/** Fisher-Yates on a fresh array (no shared state between calls). */
function shuffled(random: RandomSource, count: number): number[] {
  const lanes: number[] = [];
  for (let i = 0; i < count; i += 1) lanes.push(i);
  for (let i = lanes.length - 1; i > 0; i -= 1) {
    const j = random.int(0, i);
    const a = lanes[i] as number;
    const b = lanes[j] as number;
    lanes[i] = b;
    lanes[j] = a;
  }
  return lanes;
}
