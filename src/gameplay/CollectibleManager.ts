/**
 * Collectible (market token) manager.
 *
 * Tokens are pooled meshes that spin and bob, scroll with the world, and can be
 * pulled toward the player by the magnet power-up. Collection uses its own
 * generous hit test (rather than the strict hazard test) so grabbing a token
 * always feels like it should have worked.
 */

import { Group, Mesh, MeshLambertMaterial } from 'three';
import { GameConfig, laneToX, type GameConfigShape } from '../app/GameConfig';
import type { Collider } from './CollisionSystem';
import { buildTokenGeometry, buildTokenRingGeometry, material } from '../world/EnvironmentFactory';
import { Palette } from '../world/Palette';

export interface TokenInstance {
  readonly id: number;
  lane: number;
  x: number;
  z: number;
  ownerId: number;
  active: boolean;
  group: Group | null;
}

export interface CollectibleContext {
  readonly playerCollider: Collider;
  readonly magnetActive: boolean;
  readonly magnetRadius: number;
  /** Player world position, used as the magnet target. */
  readonly playerX: number;
  readonly playerY: number;
}

/** Token resting height above the road. */
const TOKEN_Y = 0.95;
/** Vertical band within which a token can be touched. */
const TOKEN_PICKUP_MIN_Y = 0.55;
const TOKEN_PICKUP_MAX_Y = 1.55;

export class CollectibleManager {
  private readonly pool: Group[] = [];
  readonly active: TokenInstance[] = [];
  private nextId = 1;
  private spinTime = 0;

  constructor(
    private readonly root: Group,
    private readonly config: GameConfigShape = GameConfig,
    private readonly onCollect?: (x: number, z: number) => void,
  ) {}

  get count(): number {
    return this.active.length;
  }

  get pooledCount(): number {
    return this.pool.length;
  }

  spawn(lane: number, z: number, ownerId: number): TokenInstance {
    const group = this.pool.pop() ?? this.buildToken();
    group.visible = true;
    const x = laneToX(lane, this.config);
    group.position.set(x, TOKEN_Y, z);
    const instance: TokenInstance = {
      id: this.nextId++,
      lane,
      x,
      z,
      ownerId,
      active: true,
      group,
    };
    this.active.push(instance);
    return instance;
  }

  update(dt: number, speed: number, context: CollectibleContext): void {
    this.spinTime = (this.spinTime + dt) % 6.283;
    const delta = speed * dt;

    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const token = this.active[i] as TokenInstance;
      token.z += delta;

      // Magnet: draw nearby tokens toward the runner for a satisfying sweep.
      if (context.magnetActive) {
        const dx = context.playerX - token.x;
        const dz = 0 - token.z;
        const distance = Math.hypot(dx, dz);
        if (distance < context.magnetRadius) {
          const pull = (1 - distance / context.magnetRadius) * 12 * dt;
          token.x += dx * pull;
          token.z += dz * pull * 0.6;
        }
      }

      const group = token.group;
      if (group) {
        group.position.set(token.x, TOKEN_Y, token.z);
        group.rotation.y = this.spinTime * 2.1;
        group.position.y = TOKEN_Y + Math.sin(this.spinTime * 3 + token.id) * 0.06;
      }

      if (this.tryCollect(token, context.playerCollider)) {
        this.recycleAt(i);
        this.onCollect?.(token.x, token.z);
        continue;
      }

      if (token.z > this.config.world.cullZ) this.recycleAt(i);
    }
  }

  /** Generous AABB test: wide laterally, and a forgiving vertical band. */
  private tryCollect(token: TokenInstance, player: Collider): boolean {
    const dx = Math.abs(player.centerX - token.x);
    const dz = Math.abs(player.centerZ - token.z);
    if (dx > 0.6 + player.halfWidth) return false;
    if (dz > 0.5 + player.halfDepth) return false;
    const bottom = player.centerY - player.halfHeight;
    const top = player.centerY + player.halfHeight;
    return top > TOKEN_PICKUP_MIN_Y && bottom < TOKEN_PICKUP_MAX_Y;
  }

  releaseByOwner(ownerId: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      if ((this.active[i] as TokenInstance).ownerId === ownerId) this.recycleAt(i);
    }
  }

  private recycleAt(index: number): void {
    const token = this.active[index] as TokenInstance;
    this.active.splice(index, 1);
    token.active = false;
    if (token.group) {
      token.group.visible = false;
      token.group.position.set(0, -100, 0);
      this.pool.push(token.group);
    }
    token.group = null;
  }

  reset(): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) this.recycleAt(i);
  }

  dispose(): void {
    this.reset();
    for (const group of this.pool) this.root.remove(group);
    this.pool.length = 0;
  }

  private buildToken(): Group {
    const group = new Group();
    group.name = 'token';
    const disc = new Mesh(buildTokenGeometry(), material(Palette.token));
    disc.castShadow = false;
    group.add(disc);
    const ring = new Mesh(buildTokenRingGeometry(), material(Palette.tokenDark));
    group.add(ring);
    // A dark inset so the token reads as a stamped coin, not a plain disc.
    const insetMaterial = new MeshLambertMaterial({ color: 0x8a5a12 });
    const inset = new Mesh(buildTokenRingGeometry(), insetMaterial);
    inset.scale.setScalar(0.6);
    inset.position.z = -0.05;
    group.add(inset);
    this.root.add(group);
    return group;
  }
}
