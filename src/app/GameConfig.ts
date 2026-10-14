/**
 * Central tuning table for Veeramani Surfer.
 *
 * Coordinate system (documented once, used everywhere):
 *   +X  = right across the road (lanes are laid out along X)
 *   +Y  = up
 *   -Z  = forward, the direction the runner faces and travels
 *
 * The player stays at z = 0 for the whole run; the market scrolls toward +Z at
 * the current run speed. That keeps every world coordinate small and stable no
 * matter how long a run lasts, and makes track recycling trivial.
 *
 * All distances are metres, all times are seconds.
 */

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface WorldSettings {
  /** Number of lanes across the road. */
  readonly laneCount: number;
  /** Distance between the centre of two neighbouring lanes, in metres. */
  readonly laneWidth: number;
  /** Length of one market track segment (also the recycling stride). */
  readonly segmentLength: number;
  /** How many segments are alive at once. Must cover cullZ + far plane. */
  readonly activeSegments: number;
  /** A segment whose near edge passes this Z is recycled to the far end. */
  readonly recycleZ: number;
  /**
   * How far behind the player the road already extends when a run resets. The
   * follow camera sits at camera.offsetZ in front of the player, so this must be
   * larger than that or a fresh run shows empty sky under the camera until the
   * world has scrolled far enough to catch up.
   */
  readonly startBehindZ: number;
  /** Half width of the drivable asphalt. */
  readonly roadHalfWidth: number;
  /** Any world object beyond this Z (behind the camera) is recycled. */
  readonly cullZ: number;
  /** Fog start/end - also hides the far end of the streamed track. */
  readonly fogNear: number;
  readonly fogFar: number;
  /** Base seed used when the player does not request a specific one. */
  readonly defaultSeed: number;
}

export interface PlayerSettings {
  /** Exponential smoothing rate for lane changes (higher = snappier). */
  readonly laneChangeLambda: number;
  /** Maximum body roll while crossing lanes, radians. */
  readonly laneTilt: number;
  /** Run-cycle animation speed at the base run speed, rad/s. */
  readonly runCycleRate: number;
  /** Collider used for gameplay: full standing box (independent of the mesh). */
  readonly standHeight: number;
  readonly slideHeight: number;
  readonly colliderWidth: number;
  readonly colliderDepth: number;
  /** Jump/gravity tuned for a ~2 m arc with ~0.7 s hang time. */
  readonly jumpVelocity: number;
  readonly gravity: number;
  /** Coyote time: jump still allowed shortly after leaving the ground. */
  readonly coyoteTime: number;
  /** Input buffering window for a jump pressed just before landing. */
  readonly jumpBufferTime: number;
  readonly slideDuration: number;
  /** Slide may be re-triggered, but not more often than this. */
  readonly slideCooldown: number;
  /** Stumble length after a crash. */
  readonly stumbleDuration: number;
  /** Cannot be hit again during this window after a stumble. */
  readonly invulnerableTime: number;
  /** Speed multiplier applied while stumbling. */
  readonly stumbleSpeedFactor: number;
}

export interface CameraSettings {
  /** Resting offset from the player, in world units (behind = +Z). */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly offsetZ: number;
  /** Look target offset from the player. */
  readonly lookAheadZ: number;
  readonly lookHeight: number;
  /** How much of the player's jump height the camera follows (0..1). */
  readonly verticalFollow: number;
  /** Exponential smoothing rates. */
  readonly positionLambda: number;
  readonly lateralLambda: number;
  readonly baseFov: number;
  /** Extra FOV at maximum run speed. */
  readonly extraFov: number;
  readonly maxShake: number;
  readonly shakeDecay: number;
  /** Camera never dips below this height. */
  readonly minY: number;
}

export interface ScoringSettings {
  readonly pointsPerMeter: number;
  readonly pointsPerToken: number;
  /** Cap on the multiplier power-up value. */
  readonly maxMultiplier: number;
}

export interface DifficultySettings {
  readonly baseSpeed: number;
  readonly maxSpeed: number;
  /** Metres per second of speed added per metre travelled. */
  readonly speedRamp: number;
  /** Distance between difficulty tiers, in metres. */
  readonly tierDistance: number;
  readonly maxTier: number;
  /** Minimum time between two hazard groups at the current speed. */
  readonly minReactionTime: number;
  /**
   * Crashing twice in quick succession ends the run. Chase pressure rises by
   * crashPressure on every crash and decays by the same amount per second.
   */
  readonly crashPressure: number;
  readonly pressureDecayPerSecond: number;
  readonly gameOverPressure: number;
  /** Distance travelled at which power-ups may start spawning. */
  readonly powerUpStartDistance: number;
}

export interface PowerUpSettings {
  readonly shieldDuration: number;
  readonly magnetDuration: number;
  readonly multiplierDuration: number;
  readonly boostDuration: number;
  readonly boostSpeedBonus: number;
  readonly magnetRadius: number;
  readonly multiplierValue: number;
  /** A power-up appears roughly this often, in metres travelled. */
  readonly spawnInterval: number;
  /** Picking one up again refreshes the timer instead of stacking. */
  readonly shieldBlockInvulnerability: number;
}

export interface ChaseSettings {
  /** Chase rider distance behind the player when calm / when pressured. */
  readonly calmDistance: number;
  readonly hotDistance: number;
  /** How fast the rider closes in or falls back, units/second. */
  readonly approachRate: number;
  readonly retreatRate: number;
  readonly lateralOffset: number;
}

/**
 * Opening 'vlog then chased' intro staging. All distances are metres, all times
 * are seconds from the start of the intro.
 *
 * The camera never moves from the normal follow position: instead the runner
 * turns around to face the lens for the vlog, and the delivery boys charge in
 * from behind the camera and grow into frame. That keeps the market visible (the
 * world only exists ahead of the runner) and makes the hand-off to the run
 * seamless, because the camera pose is already the gameplay pose. Do not add a
 * downward tilt here: the near edge of the road sits only a few metres in front
 * of the camera, so tilting down exposes empty sky below it.
 */
export interface IntroSettings {
  /** When the delivery boys are spotted and start charging in. */
  readonly revealAtSeconds: number;
  /** When the run begins. */
  readonly cutAtSeconds: number;
  /**
   * Where the boys start and finish. boysHiddenZ must stay beyond
   * camera.offsetZ (8.2) so they are out of shot until the reveal, and
   * boysChargeZ should equal chase.calmDistance so the run continues from exactly
   * where the intro left them.
   */
  readonly boysHiddenZ: number;
  readonly boysChargeZ: number;
}

export interface QualityProfile {
  readonly maxPixelRatio: number;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  /** Probability that an optional prop slot is filled. */
  readonly propDensity: number;
}

export interface GameConfigShape {
  readonly world: WorldSettings;
  readonly player: PlayerSettings;
  readonly camera: CameraSettings;
  readonly scoring: ScoringSettings;
  readonly difficulty: DifficultySettings;
  readonly powerUps: PowerUpSettings;
  readonly chase: ChaseSettings;
  readonly quality: Record<GraphicsQuality, QualityProfile>;
  readonly audio: { readonly masterVolume: number };
  /** Attract-mode scroll speed used behind the menus. */
  readonly attractSpeed: number;
  /** Opening 'vlog then chased' intro staging. */
  readonly intro: IntroSettings;
}

export const GameConfig: GameConfigShape = {
  world: {
    laneCount: 3,
    laneWidth: 2.6,
    segmentLength: 26,
    activeSegments: 8,
    recycleZ: 48,
    // > camera.offsetZ (8.2): the street extends 26m behind the runner on frame 1 and never drops below 22m.
    startBehindZ: 26,
    roadHalfWidth: 4.6,
    cullZ: 45,
    fogNear: 48,
    fogFar: 138,
    defaultSeed: 20261013,
  },
  player: {
    laneChangeLambda: 15,
    laneTilt: 0.3,
    runCycleRate: 11,
    standHeight: 1.78,
    slideHeight: 0.95,
    colliderWidth: 0.72,
    colliderDepth: 0.7,
    jumpVelocity: 11.6,
    gravity: 34,
    coyoteTime: 0.09,
    jumpBufferTime: 0.12,
    slideDuration: 0.62,
    slideCooldown: 0.16,
    stumbleDuration: 0.62,
    invulnerableTime: 1.05,
    stumbleSpeedFactor: 0.58,
  },
  // The camera sits high and far enough back that the two delivery boys at
  // chase.calmDistance stay inside the frame (see ChaseManager). Raising offsetZ
  // without lowering the chase distances would hide the pursuit behind the lens.
  camera: {
    offsetX: 0,
    offsetY: 3.9,
    offsetZ: 8.2,
    lookAheadZ: -4.5,
    lookHeight: 1.5,
    verticalFollow: 0.34,
    positionLambda: 6.2,
    lateralLambda: 9.5,
    baseFov: 62,
    extraFov: 7,
    maxShake: 0.34,
    shakeDecay: 7,
    minY: 1.6,
  },
  scoring: {
    pointsPerMeter: 1,
    pointsPerToken: 10,
    maxMultiplier: 4,
  },
  difficulty: {
    baseSpeed: 12.5,
    maxSpeed: 27,
    speedRamp: 0.022,
    tierDistance: 140,
    maxTier: 5,
    minReactionTime: 0.9,
    crashPressure: 0.5,
    pressureDecayPerSecond: 0.26,
    gameOverPressure: 0.6,
    powerUpStartDistance: 120,
  },
  powerUps: {
    shieldDuration: 9,
    magnetDuration: 9,
    multiplierDuration: 11,
    boostDuration: 5,
    boostSpeedBonus: 6,
    magnetRadius: 5.2,
    multiplierValue: 2,
    spawnInterval: 190,
    shieldBlockInvulnerability: 0.7,
  },
  chase: {
    // Both values must stay below camera.offsetZ (8.2) or the boys end up behind
    // the lens and the chase becomes invisible during normal play. They must also
    // stay far enough ahead of the lens that their feet stay inside the frame:
    // around 3.4 m is the deepest they can trail before the camera crops them.
    calmDistance: 3.4,
    hotDistance: 1.9,
    approachRate: 5.5,
    retreatRate: 2.4,
    lateralOffset: 1.7,
  },
  quality: {
    low: { maxPixelRatio: 1.25, shadows: false, shadowMapSize: 512, propDensity: 0.45 },
    medium: { maxPixelRatio: 1.6, shadows: true, shadowMapSize: 1024, propDensity: 0.75 },
    high: { maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, propDensity: 1 },
  },
  audio: {
    masterVolume: 0.6,
  },
  attractSpeed: 9,

  /**
   * Opening 'vlog then chased' intro.
   *
   * Beat 1 - Veeramani films his vlog: the camera holds the normal follow
   * position and he faces it, so the market stays behind him on screen.
   * Beat 2 - the two delivery boys rush in from behind the camera; he spins
   * around to run and the view widens back to the road ahead.
   * Beat 3 - the run starts, with the camera already in its gameplay pose.
   */
  intro: {
    /** When the boys are spotted and start charging in, in seconds. */
    revealAtSeconds: 2.2,
    /** When the run begins, in seconds. */
    cutAtSeconds: 4.4,
    /** Boys wait out of shot beyond the camera, then charge to the chase distance. */
    boysHiddenZ: 9.6,
    boysChargeZ: 3.4,
  },
};

/** Lane centre X offset used by the intro staging (the runner stands mid-road). */
export const INTRO_LANE = 1;


/** What Veeramani says into the camera during the opening vlog beat. */
export const VLOG_LINE: string =
  'Hey family, Veeramani here — today we run the whole santhai, come with me!';

/** The line he blurts out the moment the delivery boys are spotted. */
export const VLOG_ALARM_LINE: string =
  'Ayyo! Those two delivery boys grabbed my vlog bag — they are chasing me!';

/** Lane centre X for a lane index (0 = leftmost). */
export function laneToX(lane: number, config: GameConfigShape = GameConfig): number {
  const centre = (config.world.laneCount - 1) / 2;
  return (lane - centre) * config.world.laneWidth;
}

/** Clamp a lane index into the playable range. */
export function clampLane(lane: number, config: GameConfigShape = GameConfig): number {
  return Math.min(Math.max(Math.round(lane), 0), config.world.laneCount - 1);
}

/** Speed for a given distance travelled (also used by the unit tests). */
export function speedForDistance(
  distance: number,
  config: GameConfigShape = GameConfig,
): number {
  const { baseSpeed, maxSpeed, speedRamp } = config.difficulty;
  const travelled = Math.max(0, distance);
  return Math.min(maxSpeed, baseSpeed + travelled * speedRamp);
}

/** Difficulty tier index for a given distance travelled. */
export function tierForDistance(
  distance: number,
  config: GameConfigShape = GameConfig,
): number {
  const { tierDistance, maxTier } = config.difficulty;
  return Math.min(maxTier, Math.floor(Math.max(0, distance) / tierDistance));
}
