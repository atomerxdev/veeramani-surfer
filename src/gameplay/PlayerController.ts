/**
 * Player character controller.
 *
 * Owns everything about the runner's own body: lane movement (via LaneSystem),
 * the jump arc, the slide timer, stumble/invulnerability windows and the run
 * cycle that drives the rig. It does not know about obstacles, scores or menus -
 * GameApp wires those together, which keeps this class unit-testable.
 *
 * All timing is driven by the fixed simulation step, so movement is identical at
 * 30, 60 or 144 fps.
 */

import { GameConfig, type GameConfigShape } from '../app/GameConfig';
import type { Collider } from './CollisionSystem';
import { LaneSystem, damp } from './LaneSystem';
import type { CharacterRig, MotionState } from './character/CharacterRig';
import { wrapPhase } from './character/ProceduralCharacter';

export interface PlayerEvents {
  onJump?: () => void;
  onLand?: () => void;
  onSlide?: () => void;
  onFootstep?: () => void;
}

export class PlayerController {
  readonly lanes: LaneSystem;
  private readonly rig: CharacterRig;
  private readonly config: GameConfigShape;

  private posY = 0;
  private velocityY = 0;
  private grounded = true;
  private airTimer = 0;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private slideTimer = 0;
  private slideCooldownTimer = 0;
  private stumbleTimer = 0;
  private invulnerableTimer = 0;
  private crouch = 0;
  private cyclePhase = 0;
  private lastStepIndex = 0;
  private jumpCount = 0;
  private gameOver = false;
  private active = true;
  private lean = 0;
  private wave = 0;

  constructor(
    rig: CharacterRig,
    private readonly events: PlayerEvents = {},
    config: GameConfigShape = GameConfig,
  ) {
    this.rig = rig;
    this.config = config;
    this.lanes = new LaneSystem(config);
    this.syncTransform();
  }

  /* ------------------------------------------------------------- accessors */

  get object3D() {
    return this.rig.root;
  }

  get lane(): number {
    return this.lanes.lane;
  }

  /** Interpolated lateral position (used by collision and the camera). */
  get x(): number {
    return this.lanes.x;
  }

  get y(): number {
    return this.posY;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get isSliding(): boolean {
    return this.slideTimer > 0;
  }

  get isStumbling(): boolean {
    return this.stumbleTimer > 0;
  }

  get isInvulnerable(): boolean {
    return this.invulnerableTimer > 0;
  }

  get isGameOver(): boolean {
    return this.gameOver;
  }

  /**
   * Takeoffs since the run began. A jump only lasts a fraction of a second, so
   * this latches the event for tests that cannot sample fast enough to catch
   * the runner mid-air.
   */
  get jumps(): number {
    return this.jumpCount;
  }

  /** Current visual state, derived from timers so it can never disagree. */
  get motionState(): MotionState {
    if (this.gameOver) return 'gameover';
    if (this.stumbleTimer > 0) return 'stumble';
    if (!this.grounded) return 'jumping';
    if (this.slideTimer > 0) return 'sliding';
    return this.active ? 'running' : 'idle';
  }

  /** Forward-speed multiplier from the player's own state (stumble slows you). */
  get speedFactor(): number {
    if (this.gameOver) return 0;
    return this.stumbleTimer > 0 ? this.config.player.stumbleSpeedFactor : 1;
  }

  /** Collider box in world space. Independent of the visual meshes. */
  getCollider(): Collider {
    const config = this.config.player;
    const sliding = this.slideTimer > 0;
    const height = sliding ? config.slideHeight : config.standHeight;
    return {
      centerX: this.lanes.x,
      centerY: this.posY + height / 2,
      centerZ: 0,
      halfWidth: config.colliderWidth / 2,
      halfHeight: height / 2,
      halfDepth: config.colliderDepth / 2,
    };
  }

  /* --------------------------------------------------------------- commands */

  /** Returns true when the lane actually changed (false at the road edges). */
  requestLane(direction: number): boolean {
    if (this.gameOver) return false;
    if (direction === 0) return false;
    return this.lanes.move(direction > 0 ? 1 : -1);
  }

  requestJump(): void {
    if (this.gameOver) return;
    this.jumpBufferTimer = this.config.player.jumpBufferTime;
  }

  requestSlide(): void {
    if (this.gameOver) return;
    if (!this.grounded) return; // sliding mid-air is ignored, not queued
    if (this.slideCooldownTimer > 0 || this.stumbleTimer > 0) return;
    this.startSlide();
  }

  /** Called by the collision system after a non-fatal crash. */
  stumble(): void {
    if (this.gameOver) return;
    const config = this.config.player;
    this.stumbleTimer = config.stumbleDuration;
    this.invulnerableTimer = config.invulnerableTime;
    this.slideTimer = 0;
    this.crouch = 0;
  }

  /** Shield pickup absorbed the hit: brief invulnerability, no stumble. */
  grantInvulnerability(seconds: number): void {
    this.invulnerableTimer = Math.max(this.invulnerableTimer, seconds);
  }

  setGameOver(): void {
    this.gameOver = true;
    this.slideTimer = 0;
    this.velocityY = 0;
    this.grounded = true;
    this.posY = 0;
    this.syncTransform();
  }

  setIdle(idle: boolean): void {
    this.active = !idle;
  }

  setWave(wave: number): void {
    this.wave = Math.max(0, Math.min(1, wave));
  }

  reset(): void {
    const config = this.config.player;
    this.lanes.reset();
    this.posY = 0;
    this.velocityY = 0;
    this.grounded = true;
    this.airTimer = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.slideTimer = 0;
    this.slideCooldownTimer = 0;
    this.stumbleTimer = 0;
    this.invulnerableTimer = 0;
    this.crouch = 0;
    this.cyclePhase = 0;
    this.lastStepIndex = 0;
    this.jumpCount = 0;
    this.gameOver = false;
    this.active = true;
    this.lean = 0;
    this.wave = 0;
    this.rig.root.visible = true;
    this.rig.root.rotation.set(0, 0, 0);
    void config;
    this.syncTransform();
  }

  /* ---------------------------------------------------------------- update */

  update(dt: number, speed: number): void {
    const config = this.config.player;

    // Timers ------------------------------------------------------------
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    this.slideCooldownTimer = Math.max(0, this.slideCooldownTimer - dt);
    this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
    if (this.grounded) this.coyoteTimer = config.coyoteTime;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    // Jump --------------------------------------------------------------
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
      if (this.grounded || this.coyoteTimer > 0) {
        this.jumpBufferTimer = 0;
        this.coyoteTimer = 0;
        this.grounded = false;
        this.velocityY = config.jumpVelocity;
        this.slideTimer = 0; // a jump cancels a slide instead of fighting it
        this.crouch = 0;
        this.jumpCount += 1;
        this.events.onJump?.();
      }
    }

    // Vertical motion ----------------------------------------------------
    if (!this.grounded) {
      this.airTimer += dt;
      this.velocityY -= config.gravity * dt;
      this.posY += this.velocityY * dt;
      if (this.posY <= 0) {
        this.posY = 0;
        this.velocityY = 0;
        this.grounded = true;
        this.airTimer = 0;
        this.events.onLand?.();
      }
    }

    // Slide --------------------------------------------------------------
    if (this.slideTimer > 0) {
      this.slideTimer = Math.max(0, this.slideTimer - dt);
      if (this.slideTimer === 0) this.slideCooldownTimer = config.slideCooldown;
    }

    // Run cycle + footsteps ---------------------------------------------
    const moving = !this.gameOver;
    const speedRatio = speed / this.config.difficulty.maxSpeed;
    const rate = moving ? 2.4 + 8.6 * Math.max(0, speedRatio) : 1.6;
    if (this.grounded && this.slideTimer <= 0 && this.stumbleTimer <= 0) {
      this.cyclePhase = wrapPhase(this.cyclePhase + rate * dt);
      const stepIndex = Math.floor(this.cyclePhase / Math.PI);
      if (stepIndex !== this.lastStepIndex) {
        this.lastStepIndex = stepIndex;
        if (moving) this.events.onFootstep?.();
      }
    }

    // Crouch blend ------------------------------------------------------
    const crouchTarget = this.slideTimer > 0 ? 1 : 0;
    const crouchLambda = crouchTarget > this.crouch ? 18 : 12;
    this.crouch += (crouchTarget - this.crouch) * (1 - Math.exp(-crouchLambda * dt));
    if (Math.abs(crouchTarget - this.crouch) < 0.002) this.crouch = crouchTarget;

    // Lateral movement --------------------------------------------------
    this.lanes.update(dt);

    // Lean into the lane change: the whole body banks, which reads as momentum
    // without needing extra rig joints.
    const lateralSpeed = dt > 0 ? this.lanes.lateralVelocity / dt : 0;
    const leanTarget = Math.max(-1, Math.min(1, lateralSpeed / 11)) * config.laneTilt;
    const leanLambda = Math.abs(leanTarget) > Math.abs(this.lean) ? 9 : 6;
    this.lean = damp(this.lean, leanTarget, leanLambda, dt);

    // Rig ---------------------------------------------------------------
    this.syncTransform();
    this.rig.root.rotation.set(0, this.lean * 0.5, this.lean);
    this.rig.update(dt, {
      motion: this.motionState,
      speed,
      speedRatio,
      cyclePhase: this.cyclePhase,
      crouch: this.crouch,
      airTime: this.airTimer,
      stumble: this.stumbleTimer > 0 ? 1 : 0,
      wave: this.wave,
    });
  }

  private startSlide(): void {
    this.slideTimer = this.config.player.slideDuration;
    this.events.onSlide?.();
  }

  private syncTransform(): void {
    this.rig.root.position.set(this.lanes.x, this.posY, 0);
  }
}
