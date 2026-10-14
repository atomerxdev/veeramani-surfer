/**
 * Market builder.
 *
 * Assembles one `MarketSegment`: road surface, building facades on both
 * pavements, overhead wires and the street props that give the santhai its
 * character. Each repeating element is created as a small group of *variants*;
 * the segment toggles which variant is visible when it is recycled, which is how
 * the street stays varied without allocating anything at runtime.
 */

import { Group } from 'three';
import { GameConfig, type GameConfigShape, type QualityProfile } from '../app/GameConfig';
import type { RandomSource } from '../core/Random';
import {
  buildAwning,
  buildBicycle,
  buildCrateStack,
  buildHandcart,
  buildParcelPile,
  buildParkedScooter,
  buildRoadChunk,
  buildStall,
  buildWires,
  buildBuilding,
  group,
} from './EnvironmentFactory';
import { MarketSegment } from './MarketSegment';

/** Distance from the road centre to the centre of a building facade. */
const BUILDING_DISTANCE = 9.4;
/** Distance from the road centre to kerbside props. */
const KERB_DISTANCE = 5.4;

/** Indices into `propFactories`, used for per-prop placement rules. */
const PROP_KIND = {
  SCOOTER: 0,
  BICYCLE: 1,
  HANDCART: 2,
  PARCEL: 3,
  CRATE: 4,
  STALL: 5,
  AWNING: 6,
} as const;

export class MarketBuilder {
  constructor(private readonly config: GameConfigShape = GameConfig) {}

  createSegment(index: number, random: RandomSource, quality: QualityProfile): MarketSegment {
    const { segmentLength, roadHalfWidth } = this.config.world;
    const segment = new MarketSegment(index, segmentLength, `market-segment-${index}`);

    // ---- road
    const road = buildRoadChunk(segmentLength, roadHalfWidth);
    road.position.z = -segmentLength / 2;
    segment.group.add(road);

    // ---- buildings: two per side, each with two pre-built variants
    for (const side of [-1, 1] as const) {
      for (let slot = 0; slot < 2; slot += 1) {
        const z = -(slot + 0.5) * (segmentLength / 2);
        const variants: Group[] = [];
        for (let variant = 0; variant < 2; variant += 1) {
          const building = buildBuilding(variant, (index + slot + (side === 1 ? 2 : 0)) % 6);
          building.rotation.y = (side * Math.PI) / 2;
          building.position.set(side * BUILDING_DISTANCE, 0, z);
          segment.group.add(building);
          variants.push(building);
        }
        segment.addSlot(variants);
      }
    }

    // ---- overhead wires + festival bunting
    const wireSlot: Group[] = [];
    for (let variant = 0; variant < 2; variant += 1) {
      const wires = buildWires();
      wires.position.set(0, 5.1 + variant * 0.4, -(variant === 0 ? 0.35 : 0.78) * segmentLength);
      segment.group.add(wires);
      wireSlot.push(wires);
    }
    segment.addSlot(wireSlot, true);

    // ---- kerbside props (optional dressing, first to go on low quality)
    const propFactories: ((variant: number) => Group)[] = [
      buildParkedScooter,
      buildBicycle,
      buildHandcart,
      buildParcelPile,
      buildCrateStack,
      buildStall,
      (variant) => buildAwning(variant, 4.4, 2.4),
    ];
    const propSlots = 4;
    for (let slot = 0; slot < propSlots; slot += 1) {
      const side: -1 | 1 = slot % 2 === 0 ? -1 : 1;
      const z = -((slot + 0.5) * segmentLength) / propSlots;
      const variants: Group[] = [];
      for (let variant = 0; variant < 2; variant += 1) {
        const factoryIndex = (index + slot + variant * 3) % propFactories.length;
        const factory = propFactories[factoryIndex] as (variant: number) => Group;
        const prop = factory(index + slot * 2 + variant);
        if (factoryIndex === PROP_KIND.STALL) {
          // Stalls sit further back on the pavement and face the road.
          prop.rotation.y = (side * Math.PI) / 2;
          prop.position.set(side * (KERB_DISTANCE + 1.9), 0, z);
        } else if (factoryIndex === PROP_KIND.AWNING) {
          prop.rotation.y = (side * Math.PI) / 2;
          prop.position.set(side * (KERB_DISTANCE - 0.3), 3.15, z);
        } else {
          prop.rotation.y = (Math.PI / 2) * (side === 1 ? 1 : -1);
          prop.position.set(side * KERB_DISTANCE, 0, z);
        }
        segment.group.add(prop);
        variants.push(prop);
      }
      segment.addSlot(variants, true);
    }

    // Seed the initial look so a freshly built segment is never empty.
    segment.randomize(random, quality.propDensity);
    return segment;
  }

  /** Empty placeholder used when a segment has no content assigned yet. */
  static emptyGroup(name: string): Group {
    return group(name);
  }
}
