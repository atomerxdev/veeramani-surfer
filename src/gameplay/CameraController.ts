/**
 * Third-person follow camera.
 *
 * Sits behind and above the runner, smoothed with frame-rate independent damping.
 * Lateral movement is smoothed faster than depth so lane changes never make the
 * camera swing, and the camera only follows a fraction of the player's jump
 * height, which keeps the road and upcoming obstacles framed.
 *
 * "Reduce camera motion" (the accessibility setting) removes shake, jump follow
 * and the speed-based FOV change.
 */

import { PerspectiveCamera, Vector3 } from 'three';
import { GameConfig, type CameraSettings, type GameConfigShape } from '../app/GameConfig';

export interface CameraTarget {
  /** Interpolated player X. */
  readonly x: number;
  /** Player height above the road. */
  readonly y: number;
  readonly lane: number;
}

export class CameraController {
  readonly camera: PerspectiveCamera;
  private readonly settings: CameraSettings;
  private targetPosition = new Vector3();
  private lookTarget = new Vector3();
  private shakeAmount = 0;
  private shakeSeed = 0;
  private currentFov: number;
  private reducedMotion = false;

  constructor(config: GameConfigShape = GameConfig, aspect = 1) {
    const settings = config.camera;
    this.settings = settings;
    this.currentFov = settings.baseFov;
    this.camera = new PerspectiveCamera(this.currentFov, aspect, 0.1, 260);
    this.camera.position.set(0, settings.offsetY, settings.offsetZ);
    this.camera.lookAt(0, settings.lookHeight, settings.lookAheadZ);
  }

  get aspect(): number {
    return this.camera.aspect;
  }

  setAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  /** Jump straight to the target pose (used when a run starts or restarts). */
  snapTo(target: CameraTarget): void {
    this.applyTarget(target);
    this.shakeAmount = 0;
    this.currentFov = this.settings.baseFov;
    this.camera.fov = this.currentFov;
    this.camera.position.set(
      target.x + this.settings.offsetX,
      this.desiredHeight(target),
      this.settings.offsetZ,
    );
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.lookTarget);
  }

  /** Add a shake impulse (crash / landing feedback). */
  addShake(amount: number): void {
    if (this.reducedMotion) return;
    this.shakeAmount = Math.min(this.settings.maxShake, this.shakeAmount + amount);
  }

  /**
   * Sets the camera pose during the intro:
   * closeUpBlend: 1.0 = close-up front-facing selfie vlog camera framing Veeramani's face
   *               0.0 = normal third-person behind-the-runner gameplay view
   * Smoothly interpolates position, lookAt target, and FOV between the two.
   */
  setIntroVlogPose(closeUpBlend: number, target: CameraTarget): void {
    const b = Math.max(0, Math.min(1, closeUpBlend));
    // Smoothstep curve for natural cinematic ease in/out
    const s = b * b * (3 - 2 * b);

    // Behind-the-runner gameplay pose:
    const behindX = target.x + this.settings.offsetX;
    const behindY = this.desiredHeight(target);
    const behindZ = this.settings.offsetZ;
    const behindLookX = target.x;
    const behindLookY = target.y + this.settings.lookHeight;
    const behindLookZ = this.settings.lookAheadZ;

    // Close-up selfie vlog camera pose (in front of Veeramani, framing his face):
    const vlogX = target.x;
    const vlogY = target.y + 1.48;
    const vlogZ = 1.35;
    const vlogLookX = target.x;
    const vlogLookY = target.y + 1.42;
    const vlogLookZ = 0;

    // Interpolate camera position
    this.camera.position.x = behindX + (vlogX - behindX) * s;
    this.camera.position.y = behindY + (vlogY - behindY) * s;
    this.camera.position.z = behindZ + (vlogZ - behindZ) * s;

    // Interpolate look target
    this.lookTarget.set(
      behindLookX + (vlogLookX - behindLookX) * s,
      behindLookY + (vlogLookY - behindLookY) * s,
      behindLookZ + (vlogLookZ - behindLookZ) * s,
    );
    this.camera.lookAt(this.lookTarget);

    // Subtle wider angle FOV for the selfie vlog shot
    this.currentFov = this.settings.baseFov + 6 * s;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Sets the camera pose during the running close-up shot (e.g. 20-second milestone):
   * closeUpBlend: 1.0 = close-up front-facing tracking camera framing Veeramani running with pursuers in background
   *               0.0 = normal third-person behind-the-runner gameplay view
   * Smoothly interpolates position, lookAt target, and FOV between the two.
   */
  setRunningCloseUpPose(closeUpBlend: number, target: CameraTarget, speedRatio: number): void {
    const b = Math.max(0, Math.min(1, closeUpBlend));
    const s = b * b * (3 - 2 * b); // smoothstep curve

    // Behind-the-runner gameplay pose:
    const behindX = target.x + this.settings.offsetX;
    const behindY = this.desiredHeight(target);
    const behindZ = this.settings.offsetZ;
    const behindLookX = target.x;
    const behindLookY = target.y + this.settings.lookHeight;
    const behindLookZ = this.settings.lookAheadZ;

    // Running close-up selfie vlog camera pose:
    // Placed in front of runner at -Z, looking along +Z to frame his running face/chest
    // and reveal the two delivery boys pursuing him in the background down the road
    const closeX = target.x + 0.22;
    const closeY = target.y + 1.42;
    const closeZ = -1.65;
    const closeLookX = target.x;
    const closeLookY = target.y + 1.38;
    const closeLookZ = 0.5;

    // Interpolate camera position
    this.camera.position.x = behindX + (closeX - behindX) * s;
    this.camera.position.y = behindY + (closeY - behindY) * s;
    this.camera.position.z = behindZ + (closeZ - behindZ) * s;

    // Interpolate look target
    this.lookTarget.set(
      behindLookX + (closeLookX - behindLookX) * s,
      behindLookY + (closeLookY - behindLookY) * s,
      behindLookZ + (closeLookZ - behindLookZ) * s,
    );
    this.camera.lookAt(this.lookTarget);

    const targetFov =
      this.settings.baseFov +
      (this.reducedMotion ? 0 : this.settings.extraFov * speedRatio) +
      8 * s;
    this.currentFov = targetFov;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, target: CameraTarget, speedRatio: number): void {
    this.applyTarget(target);
    const desiredX = target.x + this.settings.offsetX;
    const desiredY = this.desiredHeight(target);

    const t = 1 - Math.exp(-this.settings.positionLambda * dt);
    this.camera.position.y += (desiredY - this.camera.position.y) * t;
    this.camera.position.z += (this.settings.offsetZ - this.camera.position.z) * t;
    // Lateral: responsive but never snappy enough to feel like it snaps.
    const lateralT = 1 - Math.exp(-this.settings.lateralLambda * dt);
    this.camera.position.x += (desiredX - this.camera.position.x) * lateralT;
    if (this.camera.position.y < this.settings.minY) this.camera.position.y = this.settings.minY;

    // Speed-driven FOV: subtle sense of acceleration.
    const targetFov = this.settings.baseFov + (this.reducedMotion ? 0 : this.settings.extraFov * speedRatio);
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, dt * 3);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // Shake decays quickly.
    if (this.shakeAmount > 0.0001) {
      this.shakeSeed += dt * 34;
      const decay = Math.exp(-this.settings.shakeDecay * dt);
      this.shakeAmount *= decay;
      const shake = this.shakeAmount;
      this.camera.position.x += Math.sin(this.shakeSeed) * shake * 0.5;
      this.camera.position.y += Math.abs(Math.cos(this.shakeSeed * 1.3)) * shake * 0.35;
      this.camera.position.z += Math.sin(this.shakeSeed * 0.7) * shake * 0.2;
    } else {
      this.shakeAmount = 0;
    }

    this.camera.lookAt(this.lookTarget);
  }

  private desiredHeight(target: CameraTarget): number {
    const follow = this.reducedMotion ? 0 : this.settings.verticalFollow;
    return this.settings.offsetY + target.y * follow;
  }

  private applyTarget(target: CameraTarget): void {
    const follow = this.reducedMotion ? 0 : this.settings.verticalFollow;
    this.targetPosition.set(target.x, target.y * follow, 0);
    this.lookTarget.set(
      target.x + this.settings.lookAheadZ * 0,
      this.settings.lookHeight + target.y * follow,
      this.settings.lookAheadZ,
    );
  }

  /** Current camera world position (debug/HUD). */
  get position(): Vector3 {
    return this.camera.position;
  }
}
