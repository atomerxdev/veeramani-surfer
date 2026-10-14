/**
 * Character abstraction.
 *
 * Gameplay code only talks to this interface, so the procedural placeholder rig
 * can be replaced by a rigged GLB model later (implement the same three members
 * and swap it in CharacterFactory) without touching movement, collision, chase or
 * scoring logic.
 */

import type { Object3D } from 'three';

export type MotionState =
  | 'idle'
  | 'running'
  | 'jumping'
  | 'sliding'
  | 'stumble'
  | 'gameover';

/** Everything a rig needs to pose itself for one frame. */
export interface RigAnimationContext {
  readonly motion: MotionState;
  /** Current forward speed in metres/second. */
  readonly speed: number;
  /** 0..1 fraction of the maximum run speed. */
  readonly speedRatio: number;
  /** Run-cycle phase in radians. Advanced by the controller, not the rig. */
  readonly cyclePhase: number;
  /** 0..1 blend for the slide pose. */
  readonly crouch: number;
  /** Seconds spent airborne (0 while grounded). */
  readonly airTime: number;
  /** 0..1 blend for the stumble pose. */
  readonly stumble: number;
  /** 0..1 blend for audience greeting wave during intro. */
  readonly wave?: number;
}

export interface CharacterRig {
  /** Add this to the scene graph; the controller moves it. */
  readonly root: Object3D;
  /** Approximate standing height in metres (used for rig scale checks). */
  readonly height: number;
  update(dt: number, context: RigAnimationContext): void;
  /** Free GPU resources. Only call when the rig is permanently discarded. */
  dispose(): void;
}
