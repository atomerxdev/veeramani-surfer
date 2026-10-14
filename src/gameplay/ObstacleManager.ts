/**
 * Obstacle manager.
 *
 * Owns every hazard in the world: pooling, placement, scrolling and recycling.
 * Meshes are pooled per hazard kind, so a long run reuses the same handful of
 * objects instead of allocating new ones.
 *
 * Hazards only ever move toward +Z (toward and past the camera); they are
 * spawned far ahead by the track manager and recycled once behind the camera.
 */

import type { Group } from 'three';
import { GameConfig, laneToX, type GameConfigShape } from '../app/GameConfig';
import type { Collider } from './CollisionSystem';
import {
  HAZARD_DEFINITIONS,
  hazardHalfExtents,
  type HazardDefinition,
  type HazardKind,
} from './HazardCatalog';

export interface HazardInstance {
  readonly id: number;
  readonly kind: HazardKind;
  readonly definition: HazardDefinition;
  lane: number;
  x: number;
  z: number;
  /** Which track segment owns this hazard (for recycling). */
  ownerId: number;
  active: boolean;
  /** True once the crash has been resolved, so it cannot hit twice. */
  resolved: boolean;
  group: Group | null;
  variant: number;
}

export class ObstacleManager {
  private readonly pools = new Map<HazardKind, Group[]>();
  private readonly spawnCount = new Map<HazardKind, number>();
  readonly active: HazardInstance[] = [];
  private nextId = 1;

  constructor(
    private readonly root: Group,
    private readonly config: GameConfigShape = GameConfig,
  ) {}

  get count(): number {
    return this.active.length;
  }

  /** Total meshes currently parked in the pools (debug/diagnostics). */
  get pooledCount(): number {
    let total = 0;
    for (const pool of this.pools.values()) total += pool.length;
    return total;
  }

  spawn(kind: HazardKind, lane: number, z: number, ownerId: number): HazardInstance {
    const definition = HAZARD_DEFINITIONS[kind];
    const variant = this.spawnCount.get(kind) ?? 0;
    this.spawnCount.set(kind, variant + 1);

    let group = this.pools.get(kind)?.pop() ?? null;
    if (!group) {
      group = definition.build(variant);
      this.root.add(group);
    }
    group.visible = true;
    group.position.set(laneToX(lane, this.config), definition.visualY, z);

    const instance: HazardInstance = {
      id: this.nextId++,
      kind,
      definition,
      lane,
      x: laneToX(lane, this.config),
      z,
      ownerId,
      active: true,
      resolved: false,
      group,
      variant,
    };
    this.active.push(instance);
    return instance;
  }

  /** Move hazards with the scrolling world and recycle anything behind us. */
  update(dt: number, speed: number): void {
    const delta = speed * dt;
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const hazard = this.active[i] as HazardInstance;
      hazard.z += delta;
      if (hazard.group) hazard.group.position.z = hazard.z;
      if (hazard.z > this.config.world.cullZ) {
        this.recycleAt(i);
      }
    }
  }

  /** World-space axis-aligned hitbox for a hazard. */
  colliderFor(hazard: HazardInstance): Collider {
    const extents = hazardHalfExtents(hazard.kind);
    return {
      centerX: hazard.x,
      centerY: extents.centerYOffset,
      centerZ: hazard.z,
      halfWidth: extents.halfWidth,
      halfHeight: extents.halfHeight,
      halfDepth: extents.halfDepth,
    };
  }

  /** Return a single hazard (e.g. after a shield absorb) to the pool. */
  despawn(hazard: HazardInstance): void {
    const index = this.active.indexOf(hazard);
    if (index < 0) return;
    this.recycleAt(index);
  }

  /** Return every hazard owned by a track segment that is being recycled. */
  releaseByOwner(ownerId: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      if ((this.active[i] as HazardInstance).ownerId === ownerId) this.recycleAt(i);
    }
  }

  private recycleAt(index: number): void {
    const hazard = this.active[index] as HazardInstance;
    this.active.splice(index, 1);
    hazard.active = false;
    if (hazard.group) {
      hazard.group.visible = false;
      hazard.group.position.set(0, -100, 0);
      const pool = this.pools.get(hazard.kind) ?? [];
      pool.push(hazard.group);
      this.pools.set(hazard.kind, pool);
    }
    hazard.group = null;
  }

  /** Clear all active hazards currently on the road (used by cinematic sequences). */
  clearActive(): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) this.recycleAt(i);
  }

  /** Clear the road (restart / menu). Meshes stay pooled for the next run. */
  reset(): void {
    this.clearActive();
  }

  dispose(): void {
    this.reset();
    for (const pool of this.pools.values()) {
      for (const group of pool) this.root.remove(group);
      pool.length = 0;
    }
    this.pools.clear();
    this.spawnCount.clear();
  }
}
