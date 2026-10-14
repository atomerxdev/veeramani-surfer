/**
 * Chase manager.
 *
 * Two delivery boys shadow the runner: Delivery-Boy 1 (orange, helmet) and
 * Delivery-Boy 2 (red, cap). They are pure animation and positioning - no AI, no
 * collision - so the core endless-runner loop stays stable. Their distance behind
 * the player is driven by chase pressure: collisions push them closer, and
 * surviving a few seconds lets them fall back.
 *
 * Placement is the whole trick. They trail at +Z (behind the runner) at a
 * distance *nearer than the follow camera*, so both boys stay framed in the lower
 * third of the screen and read as a pursuit, but never in front of the road ahead.
 * That distance is a config value, so a camera change and a chase change stay in
 * step: calmDistance must stay below camera.offsetZ.
 */

import { Group, type Object3D } from 'three';
import { GameConfig, type GameConfigShape } from '../app/GameConfig';
import type { CharacterRig } from './character/CharacterRig';
import { createCharacter, type CharacterKind } from './character/CharacterFactory';

interface Rider {
  readonly rig: CharacterRig;
  readonly name: string;
  readonly lateralSign: number;
  readonly zOffset: number;
  x: number;
  phase: number;
}

export interface ChaseContext {
  readonly playerX: number;
  readonly playerLane: number;
  readonly speed: number;
  /** 0..1 chase pressure from the difficulty manager. */
  readonly pressure: number;
  readonly active: boolean;
  /** Whether the runner is currently stumbling from an obstacle crash. */
  readonly isStumbling?: boolean;
  /** Whether the delivery boys should be visible in the far background (e.g. during running close-up). */
  readonly farBackground?: boolean;
}

export class ChaseManager {
  private readonly group = new Group();
  private readonly riders: Rider[] = [];
  private distance: number;
  private topSpeed = 0;
  private readonly HIDDEN_DISTANCE = 11.5;
  /**
   * While this is a number the boys hold that exact distance instead of reacting
   * to chase pressure. The opening intro uses it to stage their charge; gameplay
   * leaves it null.
   */
  private stagedDistance: number | null = null;

  constructor(
    parent: Object3D,
    private readonly config: GameConfigShape = GameConfig,
  ) {
    this.distance = this.HIDDEN_DISTANCE;
    this.group.name = 'chase-riders';
    parent.add(this.group);

    const layouts: readonly { kind: CharacterKind; name: string; lateralSign: number; zOffset: number }[] = [
      { kind: 'delivery1', name: 'Delivery-Boy 1', lateralSign: -1, zOffset: 0 },
      { kind: 'delivery2', name: 'Delivery-Boy 2', lateralSign: 1, zOffset: 0.85 },
    ];
    for (const layout of layouts) {
      const rig = createCharacter(layout.kind);
      rig.root.name = layout.name;
      rig.root.rotation.y = Math.PI; // the boys face the same way as the player
      this.group.add(rig.root);
      this.riders.push({
        rig,
        name: layout.name,
        lateralSign: layout.lateralSign,
        zOffset: layout.zOffset,
        x: layout.lateralSign * config.chase.lateralOffset,
        phase: layout.lateralSign > 0 ? Math.PI : 0,
      });
    }
    this.setVisible(false);
  }

  get pressureDistance(): number {
    return this.distance;
  }

  /** Names of the two chasers, in draw order (debug/HUD friendly). */
  get chaserNames(): string[] {
    return this.riders.map((rider) => rider.name);
  }

  /**
   * Intro staging only: pin both boys at an exact distance behind the runner (in
   * metres), or pass null to hand control back to chase pressure. Used by the
   * opening vlog beat, where they charge in from far to near.
   */
  setDistance(distance: number | null): void {
    this.stagedDistance = distance === null ? null : Math.max(0.5, distance);
    if (this.stagedDistance !== null) this.distance = this.stagedDistance;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  reset(): void {
    this.stagedDistance = null;
    this.distance = this.HIDDEN_DISTANCE;
    this.setVisible(false);
    for (const rider of this.riders) {
      rider.x = rider.lateralSign * this.config.chase.lateralOffset;
      rider.phase = rider.lateralSign > 0 ? Math.PI : 0;
    }
    this.topSpeed = 0;
  }

  update(dt: number, context: ChaseContext): void {
    const { chase } = this.config;
    this.topSpeed = Math.max(this.topSpeed, context.speed);
    const speedRatio = Math.min(1, context.speed / this.config.difficulty.maxSpeed);

    if (this.stagedDistance !== null) {
      // Intro staging owns the distance outright.
      this.distance = this.stagedDistance;
      this.setVisible(this.distance < 10.0);
    } else if (context.farBackground) {
      // 20-second milestone: delivery boys are visible in the background far away (~11m behind runner)
      this.setVisible(true);
      const targetDistance = 11.2;
      const blend = Math.min(1, 3.8 * dt);
      this.distance += (targetDistance - this.distance) * blend;
    } else {
      const isChasing = context.pressure > 0.04 || !!context.isStumbling;
      if (isChasing) {
        // Obstacle hit! Riders reappear immediately and surge into view behind the player.
        if (this.distance >= 9.6) {
          // Bring them in from just beyond the camera lens (camera offsetZ is 8.2)
          this.distance = 9.2;
        }
        this.setVisible(true);

        const targetDistance = context.isStumbling
          ? chase.hotDistance
          : chase.calmDistance + (chase.hotDistance - chase.calmDistance) * context.pressure;
        const rate = targetDistance < this.distance ? chase.approachRate * 1.6 : chase.retreatRate;
        const blend = Math.min(1, rate * dt);
        this.distance += (targetDistance - this.distance) * blend;
      } else {
        // Normal clean run: riders fall back behind the camera and disappear.
        const targetDistance = this.HIDDEN_DISTANCE;
        const blend = Math.min(1, chase.retreatRate * dt);
        this.distance += (targetDistance - this.distance) * blend;
        if (this.distance >= 9.5) {
          this.setVisible(false);
        } else {
          this.setVisible(true);
        }
      }
    }

    if (this.group.visible) {
      for (const rider of this.riders) {
        // Sway toward the player's lane with a lag so the chase reads as a pursuit.
        const targetX = context.playerX + rider.lateralSign * chase.lateralOffset;
        rider.x += (targetX - rider.x) * Math.min(1, dt * 2.6);
        rider.phase = (rider.phase + dt * (5.4 + 5.6 * speedRatio)) % (Math.PI * 2);
        // A small surge on top of the run cycle stops the pair looking welded to the
        // camera: they visibly lunge a little closer and drop back again.
        const surge = Math.sin(rider.phase * 0.5) * 0.22;
        rider.rig.root.position.set(rider.x, 0, this.distance + rider.zOffset + surge);
        rider.rig.update(dt, {
          motion: 'running',
          speed: context.speed,
          speedRatio,
          cyclePhase: rider.phase,
          crouch: 0,
          airTime: 0,
          stumble: 0,
        });
      }
    }
  }

  dispose(): void {
    for (const rider of this.riders) {
      rider.rig.dispose();
      this.group.remove(rider.rig.root);
    }
    this.riders.length = 0;
  }
}
