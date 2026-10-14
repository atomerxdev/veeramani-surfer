/**
 * Hazard catalogue.
 *
 * Single source of truth for what an obstacle *is*: its gameplay hitbox, the
 * action it demands from the player, the difficulty tier it unlocks at, and the
 * visual builder used to draw it. Hitboxes are hand-authored data - they never
 * derive from mesh geometry - which keeps collisions predictable and cheap.
 *
 * Hitbox heights were tuned against the player's collider
 * (stand 1.78 m, slide 0.95 m, jump apex ~1.98 m):
 *   - jump barriers sit below 0.6 m so a normal jump clears them
 *   - overhead barriers start at 1.06 m so only a slide passes
 *   - lane blockers are ~1.9 m tall so jumping cannot cheat past them
 */

import type { Group } from 'three';
import {
  buildBicycle,
  buildCrateStack,
  buildHandcart,
  buildLowBarrier,
  buildOverheadBarrier,
  buildParcelPile,
  buildParkedScooter,
} from '../world/EnvironmentFactory';

export type HazardKind =
  | 'crateStack'
  | 'handcart'
  | 'parcelPile'
  | 'scooter'
  | 'bicycle'
  | 'lowBarrier'
  | 'overheadBarrier';

/** What the player is expected to do about it. Used by the pattern generator. */
export type HazardAction = 'laneChange' | 'jump' | 'slide' | 'avoid';

export interface HazardDefinition {
  readonly kind: HazardKind;
  readonly action: HazardAction;
  /** Hitbox size in metres. */
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** Bottom of the hitbox above the road. */
  readonly baseY: number;
  /** Visual origin height (usually equals baseY). */
  readonly visualY: number;
  /** Lowest difficulty tier at which this hazard may appear. */
  readonly minTier: number;
  /** Relative frequency weight inside its tier. */
  readonly weight: number;
  readonly build: (variant: number) => Group;
}

export const HAZARD_DEFINITIONS: Record<HazardKind, HazardDefinition> = {
  crateStack: {
    kind: 'crateStack',
    action: 'laneChange',
    width: 1.85,
    height: 1.95,
    depth: 1.45,
    baseY: 0,
    visualY: 0,
    minTier: 0,
    weight: 3,
    build: buildCrateStack,
  },
  handcart: {
    kind: 'handcart',
    action: 'laneChange',
    width: 2,
    height: 1.8,
    depth: 1.6,
    baseY: 0,
    visualY: 0,
    minTier: 1,
    weight: 2.5,
    build: buildHandcart,
  },
  parcelPile: {
    kind: 'parcelPile',
    action: 'avoid',
    width: 1.5,
    height: 1.6,
    depth: 1.05,
    baseY: 0,
    visualY: 0,
    minTier: 0,
    weight: 2,
    build: buildParcelPile,
  },
  scooter: {
    kind: 'scooter',
    action: 'avoid',
    width: 0.95,
    height: 1.15,
    depth: 2.1,
    baseY: 0,
    visualY: 0,
    minTier: 1,
    weight: 2,
    build: buildParkedScooter,
  },
  bicycle: {
    kind: 'bicycle',
    action: 'avoid',
    width: 0.8,
    height: 1.05,
    depth: 1.9,
    baseY: 0,
    visualY: 0,
    minTier: 2,
    weight: 1.6,
    build: buildBicycle,
  },
  lowBarrier: {
    kind: 'lowBarrier',
    action: 'jump',
    width: 2.4,
    height: 0.6,
    depth: 0.45,
    baseY: 0,
    visualY: 0,
    minTier: 0,
    weight: 2.4,
    build: buildLowBarrier,
  },
  overheadBarrier: {
    kind: 'overheadBarrier',
    action: 'slide',
    width: 2.5,
    height: 0.89,
    depth: 0.5,
    baseY: 1.06,
    visualY: 1.5,
    minTier: 1,
    weight: 2.4,
    build: buildOverheadBarrier,
  },
};

export const HAZARD_KINDS = Object.keys(HAZARD_DEFINITIONS) as HazardKind[];

/** Half-extents of a hazard's hitbox along each axis. */
export function hazardHalfExtents(kind: HazardKind): {
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
  centerYOffset: number;
} {
  const definition = HAZARD_DEFINITIONS[kind];
  return {
    halfWidth: definition.width / 2,
    halfHeight: definition.height / 2,
    halfDepth: definition.depth / 2,
    centerYOffset: definition.baseY + definition.height / 2,
  };
}
