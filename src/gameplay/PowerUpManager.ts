/**
 * Power-up manager.
 *
 * Four effects: shield, magnet, score multiplier and speed boost. Design rules
 * from the brief, enforced in code:
 *   - every effect has an explicit duration and is refreshed (never stacked) when
 *     picked up again, so the value can never grow out of control
 *   - `clear()` is called on every restart, so no effect can survive into a new run
 *   - each effect exposes a 0..1 remaining ratio for the HUD badge
 */

import { Group, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { GameConfig, laneToX, type GameConfigShape } from '../app/GameConfig';
import type { Collider } from './CollisionSystem';
import { buildPowerUpGeometry, material } from '../world/EnvironmentFactory';
import { buildMagnet3DModel } from '../world/MagnetModel';
import { buildShield3DModel } from '../world/ShieldModel';
import { Palette } from '../world/Palette';

export type PowerUpKind = 'shield' | 'magnet' | 'multiplier' | 'boost';

export const POWER_UP_KINDS: readonly PowerUpKind[] = ['shield', 'magnet', 'multiplier', 'boost'];

export const POWER_UP_LABELS: Record<PowerUpKind, string> = {
  shield: 'Shield',
  magnet: 'Magnet',
  multiplier: 'Double score',
  boost: 'Boost',
};

const POWER_UP_COLORS: Record<PowerUpKind, number> = {
  shield: Palette.shield,
  magnet: Palette.magnet,
  multiplier: Palette.multiplier,
  boost: Palette.boost,
};

export interface PowerUpPickup {
  readonly id: number;
  readonly kind: PowerUpKind;
  lane: number;
  x: number;
  z: number;
  ownerId: number;
  active: boolean;
  group: Group | null;
}

export interface ActivePowerUp {
  readonly kind: PowerUpKind;
  readonly remaining: number;
  readonly duration: number;
  readonly ratio: number;
}

const PICKUP_Y = 1.05;

export class PowerUpManager {
  private readonly pool = new Map<PowerUpKind, Group[]>();
  private readonly timers = new Map<PowerUpKind, number>();
  readonly active: PowerUpPickup[] = [];
  private nextId = 1;
  private spin = 0;

  constructor(
    private readonly root: Group,
    private readonly config: GameConfigShape = GameConfig,
    private readonly onPickup?: (kind: PowerUpKind) => void,
    private readonly onExpire?: (kind: PowerUpKind) => void,
  ) {}

  get count(): number {
    return this.active.length;
  }

  /* ----------------------------------------------------------- pickups */

  spawn(kind: PowerUpKind, lane: number, z: number, ownerId: number): PowerUpPickup {
    const pool = this.pool.get(kind) ?? [];
    const group = pool.pop() ?? this.buildPickup(kind);
    this.pool.set(kind, pool);
    group.visible = true;
    const x = laneToX(lane, this.config);
    group.position.set(x, PICKUP_Y, z);
    const pickup: PowerUpPickup = {
      id: this.nextId++,
      kind,
      lane,
      x,
      z,
      ownerId,
      active: true,
      group,
    };
    this.active.push(pickup);
    return pickup;
  }

  update(dt: number, speed: number, playerCollider: Collider): void {
    const delta = speed * dt;
    this.spin = (this.spin + dt) % 6.283;

    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const pickup = this.active[i] as PowerUpPickup;
      pickup.z += delta;
      if (pickup.group) {
        pickup.group.position.set(pickup.x, PICKUP_Y + Math.sin(this.spin * 2 + pickup.id) * 0.09, pickup.z);
        pickup.group.rotation.y = this.spin * 1.4;
      }

      if (this.touches(pickup, playerCollider)) {
        this.activate(pickup.kind);
        this.onPickup?.(pickup.kind);
        this.recycleAt(i);
        continue;
      }
      if (pickup.z > this.config.world.cullZ) this.recycleAt(i);
    }
  }

  private touches(pickup: PowerUpPickup, player: Collider): boolean {
    const dx = Math.abs(player.centerX - pickup.x);
    const dz = Math.abs(player.centerZ - pickup.z);
    if (dx > 0.7 + player.halfWidth) return false;
    if (dz > 0.6 + player.halfDepth) return false;
    const bottom = player.centerY - player.halfHeight;
    const top = player.centerY + player.halfHeight;
    return top > 0.4 && bottom < 1.7;
  }

  /* ----------------------------------------------------------- effects */

  /** Start or refresh an effect. Refreshing never stacks the multiplier value. */
  activate(kind: PowerUpKind, durationOverride?: number): void {
    const duration = durationOverride ?? this.durationFor(kind);
    this.timers.set(kind, Math.max(duration, this.timers.get(kind) ?? 0));
  }

  private durationFor(kind: PowerUpKind): number {
    const settings = this.config.powerUps;
    switch (kind) {
      case 'shield':
        return settings.shieldDuration;
      case 'magnet':
        return settings.magnetDuration;
      case 'multiplier':
        return settings.multiplierDuration;
      case 'boost':
        return settings.boostDuration;
      default:
        return 5;
    }
  }

  /** Tick effect timers. Only called while actually playing. */
  updateTimers(dt: number): void {
    for (const kind of POWER_UP_KINDS) {
      const remaining = this.timers.get(kind);
      if (remaining === undefined) continue;
      const next = remaining - dt;
      if (next <= 0) {
        this.timers.delete(kind);
        this.onExpire?.(kind);
      } else {
        this.timers.set(kind, next);
      }
    }
  }

  isActive(kind: PowerUpKind): boolean {
    return (this.timers.get(kind) ?? 0) > 0;
  }

  remaining(kind: PowerUpKind): number {
    return this.timers.get(kind) ?? 0;
  }

  get isShieldActive(): boolean {
    return this.isActive('shield');
  }

  get isMagnetActive(): boolean {
    return this.isActive('magnet');
  }

  /** Score multiplier from the multiplier power-up (1 when inactive). */
  get scoreMultiplier(): number {
    return this.isActive('multiplier') ? this.config.powerUps.multiplierValue : 1;
  }

  /** Extra forward speed in m/s from the boost power-up. */
  get speedBonus(): number {
    return this.isActive('boost') ? this.config.powerUps.boostSpeedBonus : 0;
  }

  get magnetRadius(): number {
    return this.config.powerUps.magnetRadius;
  }

  /** Consume the shield on a crash. Returns true if a shield absorbed the hit. */
  consumeShield(): boolean {
    if (!this.isShieldActive) return false;
    this.timers.delete('shield');
    return true;
  }

  listActive(): ActivePowerUp[] {
    const result: ActivePowerUp[] = [];
    for (const kind of POWER_UP_KINDS) {
      const remaining = this.remaining(kind);
      if (remaining <= 0) continue;
      const duration = this.durationFor(kind);
      result.push({ kind, remaining, duration, ratio: Math.min(1, remaining / duration) });
    }
    return result;
  }

  /** Drop every effect and pickup. Called on restart so nothing carries over. */
  clear(): void {
    this.timers.clear();
    for (let i = this.active.length - 1; i >= 0; i -= 1) this.recycleAt(i);
  }

  releaseByOwner(ownerId: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      if ((this.active[i] as PowerUpPickup).ownerId === ownerId) this.recycleAt(i);
    }
  }

  private recycleAt(index: number): void {
    const pickup = this.active[index] as PowerUpPickup;
    this.active.splice(index, 1);
    pickup.active = false;
    if (pickup.group) {
      pickup.group.visible = false;
      pickup.group.position.set(0, -100, 0);
      const pool = this.pool.get(pickup.kind) ?? [];
      pool.push(pickup.group);
      this.pool.set(pickup.kind, pool);
    }
    pickup.group = null;
  }

  dispose(): void {
    this.clear();
    for (const pool of this.pool.values()) {
      for (const group of pool) this.root.remove(group);
      pool.length = 0;
    }
    this.pool.clear();
  }

  private buildPickup(kind: PowerUpKind): Group {
    if (kind === 'shield') {
      const shield = buildShield3DModel();
      this.root.add(shield as unknown as Object3D);
      return shield;
    }
    if (kind === 'magnet') {
      const magnet = buildMagnet3DModel();
      this.root.add(magnet as unknown as Object3D);
      return magnet;
    }

    const group = new Group();
    group.name = `powerup-${kind}`;
    const body = new Mesh(buildPowerUpGeometry(kind), material(POWER_UP_COLORS[kind]));
    body.castShadow = false;
    group.add(body);
    // Bright halo so a power-up is readable from far away.
    const halo = new Mesh(
      buildPowerUpGeometry('shield'),
      new MeshBasicMaterial({
        color: POWER_UP_COLORS[kind],
        transparent: true,
        opacity: 0.25,
      }),
    );
    halo.scale.setScalar(1.45);
    halo.rotation.z = Math.PI / 4;
    group.add(halo);
    this.root.add(group as unknown as Object3D);
    return group;
  }
}
