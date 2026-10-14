/**
 * One recycled piece of market street.
 *
 * A segment owns its road surface, building facades and street props, plus the
 * list of prop "slots" that can be re-rolled whenever the segment is recycled to
 * the far end of the track. Re-rolling only toggles the visibility of pre-built
 * variants, so variation costs no allocations and cannot grow the scene graph.
 *
 * Segment local space: the near edge (the end facing the player) sits at z = 0
 * and the segment extends toward -Z for `length` metres.
 */

import { Group } from 'three';
import type { RandomSource } from '../core/Random';

export interface SegmentSlot {
  readonly options: Group[];
  visibleIndex: number;
  /** Optional dressing: may be hidden entirely by the quality profile. */
  readonly optional: boolean;
  hidden: boolean;
}

export class MarketSegment {
  readonly group: Group;
  private readonly slots: SegmentSlot[] = [];
  /** World Z of the near edge. */
  originZ = 0;

  constructor(
    readonly index: number,
    readonly length: number,
    name: string,
  ) {
    this.group = new Group();
    this.group.name = name;
  }

  addSlot(options: Group[], optional = false): SegmentSlot {
    const slot: SegmentSlot = { options, visibleIndex: 0, optional, hidden: false };
    this.slots.push(slot);
    for (let i = 0; i < options.length; i += 1) {
      (options[i] as Group).visible = i === 0;
    }
    return slot;
  }

  /** Move the segment so its near edge sits at `z`. */
  setOrigin(z: number): void {
    this.originZ = z;
    this.group.position.z = z;
  }

  /** Re-roll which pre-built variant is visible in each slot. */
  randomize(random: RandomSource, density = 1): void {
    for (const slot of this.slots) {
      const next = random.int(0, slot.options.length - 1);
      if (next !== slot.visibleIndex) {
        (slot.options[slot.visibleIndex] as Group).visible = false;
        slot.visibleIndex = next;
      }
      // Optional dressing respects the graphics quality density.
      slot.hidden = slot.optional && density < 1 && !random.chance(density);
      (slot.options[slot.visibleIndex] as Group).visible = !slot.hidden;
    }
  }

  dispose(): void {
    this.group.clear();
    this.slots.length = 0;
  }
}
