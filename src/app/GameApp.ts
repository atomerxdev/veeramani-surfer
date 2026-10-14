/**
 * Game application.
 *
 * Owns the renderer, scene, subsystems and the run lifecycle. This is the only
 * place that knows how the parts fit together: gameplay classes stay independent
 * and testable, and the UI only talks to the state machine and the managers
 * through this facade.
 *
 * Lifecycle: init() builds everything once. Nothing visual is recreated between
 * runs - a restart resets state, resets the pools and re-rolls the track, which is
 * what keeps repeated runs free of memory growth.
 */

import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  GameConfig,
  INTRO_LANE,
  VLOG_ALARM_LINE,
  VLOG_LINE,
  type GraphicsQuality,
  type QualityProfile,
} from './GameConfig';
import { GameStateMachine, type GameStateName } from './GameState';
import { GameLoop } from '../core/GameLoop';
import { InputManager, bindTouchPad, type InputAction } from '../core/InputManager';
import { AudioManager } from '../core/AudioManager';
import { StorageManager } from '../core/StorageManager';
import { createCharacter } from '../gameplay/character/CharacterFactory';
import { PlayerController } from '../gameplay/PlayerController';
import { CameraController } from '../gameplay/CameraController';
import { ObstacleManager } from '../gameplay/ObstacleManager';
import { CollectibleManager } from '../gameplay/CollectibleManager';
import { PowerUpManager, type PowerUpKind } from '../gameplay/PowerUpManager';
import { DifficultyManager } from '../gameplay/DifficultyManager';
import { TrackManager } from '../gameplay/TrackManager';
import { ScoreManager, type RunResult } from '../gameplay/ScoreManager';
import { ChaseManager } from '../gameplay/ChaseManager';
import { EffectsPool } from '../gameplay/Effects';
import { LeaderboardService } from '../gameplay/leaderboard/LeaderboardService';
import type { LeaderboardTab } from '../gameplay/leaderboard/LeaderboardTypes';
import { boxesOverlap, type Collider } from '../gameplay/CollisionSystem';
import { UIManager } from '../ui/UIManager';
import type { SettingsChange } from '../ui/SettingsController';
import { Palette } from '../world/Palette';
import { buildActiveShieldBubble } from '../world/ShieldModel';
import introAudioUrl from '../assets/intro audio.mp3';
import after20AudioUrl from '../assets/after 20.mp3';

export interface GameAppOptions {
  readonly canvas: HTMLCanvasElement;
  readonly storage?: StorageManager;
  /** Force a track seed (used by tests for reproducibility). */
  readonly seed?: number;
}

/** Nothing can be touched from this fake collider, used for attract mode. */
const GHOST_COLLIDER: Collider = {
  centerX: 0,
  centerY: -999,
  centerZ: 0,
  halfWidth: 0.05,
  halfHeight: 0.05,
  halfDepth: 0.05,
};

export class GameApp {
  readonly state = new GameStateMachine();

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly worldRoot = new Group();
  private readonly cameraController: CameraController;
  private readonly storage: StorageManager;
  private readonly audio: AudioManager;
  private readonly input: InputManager;
  private readonly ui: UIManager;
  private readonly loop: GameLoop;

  private readonly player: PlayerController;
  private readonly obstacles: ObstacleManager;
  private readonly collectibles: CollectibleManager;
  private readonly powerUps: PowerUpManager;
  private readonly difficulty = new DifficultyManager();
  private readonly track: TrackManager;
  private readonly score: ScoreManager;
  private readonly chase: ChaseManager;
  private readonly effects: EffectsPool;
  private readonly sun: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly ambient: AmbientLight;
  private readonly activeShieldBubble: Group;

  private quality: GraphicsQuality;
  private qualityProfile: QualityProfile;
  private readonly leaderboard: LeaderboardService;
  private lastRunResult: RunResult | null = null;
  private lastRunTime = 0;
  private runDistance = 0;
  private runTime = 0;
  private milestone20Triggered = false;
  private milestone20Active = false;
  private milestone20Timer = 0;
  private milestone20Blend = 0;
  private hudAccumulator = 0;
  private smoothedFps = 0;
  private disposed = false;
  private readonly forcedSeed: number | null;

  // Opening 'vlog then chased' intro: staging timer and the current beat.
  private introTimer = 0;
  private introPhase: 0 | 1 | 2 = 0;

  constructor(private readonly options: GameAppOptions) {
    this.storage = options.storage ?? new StorageManager();
    this.forcedSeed = options.seed ?? null;
    this.quality = this.storage.getSettings().quality;
    this.qualityProfile = GameConfig.quality[this.quality];

    this.renderer = new WebGLRenderer({
      canvas: options.canvas,
      antialias: this.quality !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setClearColor(new Color(Palette.sky));
    this.scene.background = new Color(Palette.sky);
    this.scene.fog = new Fog(Palette.fog, GameConfig.world.fogNear, GameConfig.world.fogFar);

    this.cameraController = new CameraController(GameConfig, 1);
    this.cameraController.setReducedMotion(this.storage.getSettings().reducedMotion);

    // Lights: warm afternoon sun plus a soft hemisphere fill.
    this.hemi = new HemisphereLight(Palette.ambientSky, Palette.ambientGround, 0.85);
    this.scene.add(this.hemi);
    this.ambient = new AmbientLight(0xffffff, 0.18);
    this.scene.add(this.ambient);
    this.sun = new DirectionalLight(Palette.sunLight, 1.35);
    this.sun.position.set(-9, 16, 7);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.scene.add(this.worldRoot);

    // Player
    this.player = new PlayerController(createCharacter('protagonist'), {
      onJump: () => this.audio.play('jump'),
      onLand: () => this.audio.play('land'),
      onSlide: () => this.audio.play('slide'),
      onFootstep: () => this.audio.play('footstep'),
    });
    this.scene.add(this.player.object3D);
    this.activeShieldBubble = buildActiveShieldBubble();
    this.activeShieldBubble.position.set(0, 0.9, 0);
    this.player.object3D.add(this.activeShieldBubble);

    // Gameplay managers
    this.effects = new EffectsPool(this.worldRoot);
    this.obstacles = new ObstacleManager(this.worldRoot);
    this.collectibles = new CollectibleManager(this.worldRoot, GameConfig, (x, z) => {
      this.score.addTokens(1, this.powerUps.scoreMultiplier);
      this.audio.play('coin', 0.8);
      this.effects.pop(x, 0.95, z, Palette.token, 0.6, 0.26);
    });
    this.powerUps = new PowerUpManager(
      this.worldRoot,
      GameConfig,
      (kind) => this.onPowerUpPickup(kind),
      (kind) => this.ui.announce(`${kind} expired`),
    );
    this.track = new TrackManager({
      root: this.worldRoot,
      obstacles: this.obstacles,
      collectibles: this.collectibles,
      powerUps: this.powerUps,
      difficulty: this.difficulty,
      getQuality: () => this.qualityProfile,
    });
    this.score = new ScoreManager(this.storage);
    this.chase = new ChaseManager(this.scene, GameConfig);

    this.audio = new AudioManager({
      masterVolume: GameConfig.audio.masterVolume,
      muted: !this.storage.getSettings().sound,
    });

    this.input = new InputManager(options.canvas, {
      onAction: (action) => this.handleAction(action),
    });

    this.leaderboard = new LeaderboardService(this.storage.rawStorage);

    this.ui = new UIManager(
      {
        onPlay: () => this.startIntro(),
        onRestart: () => this.startRun(),
        onResume: () => this.resume(),
        onPause: () => this.pause(),
        onQuit: () => this.quitToMenu(),
        onTutorial: () => this.showTutorial(),
        onOpenSettings: () => this.openSettings(),
        onCloseSettings: () => this.closeSettings(),
        onLeaderboard: () => this.openLeaderboard(),
        onCloseLeaderboard: () => this.closeLeaderboard(),
        onSubmitScore: () => void this.handleSubmitScore(),
        onLeaderboardTabChange: (tab) => void this.refreshLeaderboard(tab),
        onRandomName: () => this.handleRandomName(),
        onPlayerNameChanged: (name) => this.handlePlayerNameChanged(name),
        onToggleMute: () => this.toggleMute(),
        onResetData: () => this.resetSavedData(),
        onSettingsChanged: (change) => this.applySettings(change),
        onUserGesture: () => void this.audio.unlock(),
      },
      { touchDevice: detectTouch() },
    );
    this.ui.syncProfile(this.storage.get());
    this.ui.setGameState(this.state.current);

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      (_alpha, delta) => this.render(delta),
      { fixedStep: 1 / 60, maxSubSteps: 5 },
      (visible) => this.onVisibilityChange(visible),
    );
    this.applyQuality();
    this.addEventListeners();
  }

  /* ------------------------------------------------------------- lifecycle */

  /** Build the first world, then show the main menu. */
  init(): void {
    this.track.reset(this.forcedSeed ?? randomSeed());
    this.player.setIdle(false);
    this.cameraController.snapTo(this.cameraTarget());
    this.state.transition('MainMenu');
    this.ui.setGameState('MainMenu');
    this.ui.setSeedLabel(this.forcedSeed);
    this.ui.menu.setPlayerName(this.leaderboard.getPlayerName());
  }

  start(): void {
    this.loop.start();
  }

  /**
   * Create/resume the audio context. Must be called from a user gesture - the
   * entry point calls it on the first pointer or key event.
   */
  async unlockAudio(): Promise<boolean> {
    const running = await this.audio.unlock();
    if (this.storage.getSettings().sound) this.audio.startAmbience();
    this.audio.setAmbienceLevel(0.5);
    return running;
  }

  /**
   * Begin the opening 'vlog then chased' intro from the main menu.
   *
   * Beat 1: the camera is parked in front of Veeramani while he films his vlog,
   * so we see his face against the market. Beat 2: the two delivery boys come
   * charging down the street behind him. Beat 3: the camera cuts to the usual
   * behind-the-runner chase view and the endless run starts.
   */
  startIntro(): void {
    void this.audio.unlock();
    this.resetMilestone20();
    this.runDistance = 0;
    this.score.reset();
    this.difficulty.reset();
    this.powerUps.clear();
    this.effects.reset();
    this.player.reset();
    this.chase.reset();
    this.chase.setVisible(true);
    this.chase.setDistance(GameConfig.intro.boysHiddenZ);
    this.track.reset(this.forcedSeed ?? randomSeed());
    this.ui.hud.reset();
    this.ui.hud.setBest(this.score.best);

    this.introTimer = 0;
    this.introPhase = 0;
    this.player.object3D.rotation.y = Math.PI; // face the lens for the vlog
    this.player.setWave(1); // wave right hand to audience while intro audio plays
    this.ui.vlog.setAlarmed(false);
    this.ui.vlog.setLine(VLOG_LINE, 'Live vlog — the santhai run');

    this.state.transition('Intro');
    this.ui.setGameState('Intro');
    this.ui.announce(VLOG_LINE);
    this.audio.playIntroTrack(introAudioUrl);
    this.cameraController.setIntroVlogPose(1, this.cameraTarget());
    this.audio.play('start');
    if (this.storage.getSettings().sound) {
      this.audio.startAmbience();
      this.audio.setAmbienceLevel(1);
    }
    this.input.setEnabled(true);
  }

  /**
   * A direct restart that skips the intro and drops the player straight into a
   * fresh endless run (for example from the game-over screen).
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    this.removeEventListeners();
    this.input.detach();
    this.ui.dispose();
    this.chase.dispose();
    this.track.dispose();
    this.obstacles.dispose();
    this.collectibles.dispose();
    this.powerUps.dispose();
    this.effects.dispose();
    this.audio.stopAfter20Track();
    this.audio.dispose();
    this.renderer.dispose();
  }

  /* ------------------------------------------------------------ run control */

  startRun(): void {
    void this.audio.unlock();
    this.audio.stopIntroTrack();
    this.resetMilestone20();
    this.runDistance = 0;
    this.score.reset();
    this.difficulty.reset();
    this.powerUps.clear();
    this.effects.reset();
    this.player.reset();
    this.activeShieldBubble.visible = false;
    this.chase.reset();
    this.track.reset(this.forcedSeed ?? randomSeed());
    this.cameraController.snapTo(this.cameraTarget());
    this.ui.hud.reset();
    this.ui.hud.setBest(this.score.best);

    this.state.transition('Playing');
    this.ui.setGameState('Playing');
    this.ui.announce('Run started. Three lanes, jump the low barriers, slide under the banners.');
    this.audio.play('start');
    if (this.storage.getSettings().sound) {
      this.audio.startAmbience();
      this.audio.setAmbienceLevel(1);
    }
    this.input.setEnabled(true);
  }

  pause(): void {
    if (!this.state.isPlaying()) return;
    this.state.transition('Paused');
    this.ui.setGameState('Paused');
    this.input.setEnabled(false);
    this.audio.setAmbienceLevel(0.25);
    this.ui.announce('Paused');
  }

  resume(): void {
    if (this.state.current !== 'Paused' || this.ui.isSettingsOpen) return;
    this.state.transition('Playing');
    this.ui.setGameState('Playing');
    this.input.setEnabled(true);
    this.audio.setAmbienceLevel(1);
    this.ui.announce('Resumed');
  }

  quitToMenu(): void {
    this.audio.stopIntroTrack();
    this.resetMilestone20();
    this.player.setWave(0);
    this.state.transition('MainMenu');
    this.ui.setGameState('MainMenu');
    this.ui.syncProfile(this.storage.get());
    this.ui.menu.setPlayerName(this.leaderboard.getPlayerName());
    this.input.setEnabled(false);
    this.chase.setVisible(false);
    this.player.setIdle(false);
    this.audio.setAmbienceLevel(0.5);
    this.ui.announce('Main menu');
  }

  showTutorial(): void {
    this.state.transition('Tutorial');
    this.ui.setGameState('Tutorial');
    this.input.setEnabled(false);
  }

  openSettings(): void {
    this.state.transition('Settings');
    this.ui.openSettings();
    // Keep the UI manager's cached state in step, otherwise the screen it thinks
    // it is on (menu/pause) would stay visible behind the settings panel.
    this.ui.setGameState(this.state.current);
    this.input.setEnabled(false);
  }

  closeSettings(): void {
    const returnState = this.state.settingsReturnState;
    this.state.transition(returnState);
    this.ui.closeSettings();
    this.ui.setGameState(returnState);
    this.input.setEnabled(returnState === 'Playing');
    this.ui.syncProfile(this.storage.get());
  }

  openLeaderboard(): void {
    this.state.transition('Leaderboard');
    this.ui.setGameState('Leaderboard');
    this.input.setEnabled(false);
    void this.refreshLeaderboard(this.ui.leaderboard.activeTab);
    this.audio.play('click');
    this.ui.announce('Leaderboard open');
  }

  closeLeaderboard(): void {
    const returnState = this.state.leaderboardReturnState;
    this.state.transition(returnState);
    this.ui.setGameState(returnState);
    this.input.setEnabled(returnState === 'Playing');
    if (returnState === 'MainMenu') {
      this.ui.syncProfile(this.storage.get());
    }
    this.audio.play('click');
  }

  async refreshLeaderboard(tab: LeaderboardTab): Promise<void> {
    const summary = await this.leaderboard.getLeaderboard(tab);
    this.ui.leaderboard.render(summary);
  }

  private async handleSubmitScore(): Promise<void> {
    if (!this.lastRunResult) return;
    const name = this.leaderboard.getPlayerName();

    const res = await this.leaderboard.submitScore({
      name,
      score: this.lastRunResult.score,
      distance: this.lastRunResult.distance,
      tokens: this.lastRunResult.tokens,
      runTimeSeconds: Math.max(1, Math.floor(this.lastRunTime)),
    });

    if (res.success) {
      this.audio.play('click');
      const rankMsg = res.localRank ? `Saved as ${name} • Rank #${res.localRank}` : `Saved to leaderboard as ${name}!`;
      this.ui.gameover.showSaved(rankMsg, true);
      this.ui.announce(rankMsg);
    } else {
      this.ui.gameover.showSaved(`Recorded locally as ${name}`, false);
    }
  }

  private handleRandomName(): void {
    const newName = this.leaderboard.rollRandomPlayerName();
    this.ui.menu.setPlayerName(newName);
    this.audio.play('click');
    this.ui.announce(`Runner name changed to ${newName}`);
  }

  private handlePlayerNameChanged(name: string): void {
    this.leaderboard.setPlayerName(name);
  }

  /* -------------------------------------------------------------- settings */

  applySettings(change: SettingsChange): void {
    this.storage.patchSettings(change);
    this.audio.setMuted(!change.sound);
    this.cameraController.setReducedMotion(change.reducedMotion);
    this.ui.setTouchPadForced(change.touchPad);
    this.ui.menu.setMuted(!change.sound);
    this.setQuality(change.quality);
    this.cameraController.setReducedMotion(change.reducedMotion);
  }

  private setQuality(quality: GraphicsQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.qualityProfile = GameConfig.quality[quality];
    this.applyQuality();
  }

  private applyQuality(): void {
    const profile = this.qualityProfile;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.shadowMap.enabled = profile.shadows;
    this.sun.castShadow = profile.shadows;
    if (profile.shadows) {
      this.sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      this.sun.shadow.camera.near = 1;
      this.sun.shadow.camera.far = 60;
      this.sun.shadow.camera.left = -14;
      this.sun.shadow.camera.right = 14;
      this.sun.shadow.camera.top = 14;
      this.sun.shadow.camera.bottom = -14;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.02;
    }
    this.resize();
  }

  private toggleMute(): void {
    const settings = this.storage.getSettings();
    const next = { ...settings, sound: !settings.sound };
    this.storage.patchSettings({ sound: next.sound });
    this.audio.setMuted(!next.sound);
    this.ui.menu.setMuted(!next.sound);
    this.ui.settings.sync(next);
    if (next.sound) void this.audio.unlock();
    this.audio.play('click');
  }

  private resetSavedData(): void {
    this.storage.reset();
    this.ui.syncProfile(this.storage.get());
    this.score.reset();
    this.ui.hud.setBest(this.score.best);
    this.audio.play('click');
    this.ui.announce('Saved data cleared');
  }

  /* ------------------------------------------------------------------ input */

  private handleAction(action: InputAction): void {
    void this.audio.unlock();
    const current = this.state.current;

    // Global actions: these work from any screen that can accept them.
    if (action === 'mute') {
      this.toggleMute();
      return;
    }
    if (action === 'pause') {
      if (current === 'Playing') this.pause();
      else if (current === 'Paused' && !this.ui.isSettingsOpen) this.resume();
      else if (current === 'Settings') this.closeSettings();
      return;
    }

    // Movement is only ever read while actually playing.
    if (current !== 'Playing') return;
    switch (action) {
      case 'left':
        if (this.player.requestLane(-1)) this.audio.play('click', 0.4);
        break;
      case 'right':
        if (this.player.requestLane(1)) this.audio.play('click', 0.4);
        break;
      case 'jump':
        this.player.requestJump();
        break;
      case 'slide':
        this.player.requestSlide();
        break;
      default:
        break;
    }
  }

  private onPowerUpPickup(kind: PowerUpKind): void {
    this.audio.play('powerup');
    const collider = this.player.getCollider();
    const color =
      kind === 'shield'
        ? Palette.shield
        : kind === 'magnet'
          ? Palette.magnet
          : kind === 'multiplier'
            ? Palette.multiplier
            : Palette.boost;
    this.effects.pop(collider.centerX, 1.0, collider.centerZ, color, 1.3, 0.4);
    this.ui.announce(`${kind} activated`);
  }

  /* ----------------------------------------------------------------- update */

  private update(dt: number): void {
    // The only state where the character stands still is the loading screen.
    this.player.setIdle(this.state.current === 'Loading' || this.state.current === 'Intro');

    switch (this.state.current) {
      case 'Intro':
        // advanceIntro may hand over to Playing mid-step, so only simulate while
        // we are still in the intro.
        this.advanceIntro(dt);
        if (this.state.current === 'Intro') this.simulateIntro(dt);
        break;
      case 'Playing':
        this.simulateRun(dt);
        break;
      case 'MainMenu':
      case 'Tutorial':
      case 'Settings':
      case 'Leaderboard':
        this.simulateAttract(dt);
        break;
      case 'Loading':
        this.player.setIdle(true);
        this.player.update(dt, 0);
        this.cameraController.update(dt, this.cameraTarget(), 0);
        break;
      case 'Paused':
      case 'GameOver':
      default:
        // Frozen: only the camera (and nothing else) keeps settling.
        this.cameraController.update(dt, this.cameraTarget(), 0);
        break;
    }
  }

  private simulateRun(dt: number): void {
    const speed = this.currentSpeed();
    this.player.update(dt, speed);

    const travelled = speed * dt;
    this.runDistance += travelled;
    this.runTime += dt;
    this.difficulty.advance(dt, this.runDistance);
    this.score.addDistance(travelled, this.powerUps.scoreMultiplier);

    // 20-second milestone: close-up shot while running, play 'after 20.mp3',
    // no obstacles on the road, delivery boys visible in background far away.
    if (this.runTime >= 20.0 && !this.milestone20Triggered && !this.player.isGameOver) {
      this.triggerMilestone20();
    }

    // Smooth camera blend for milestone
    const targetBlend = this.milestone20Active ? 1 : 0;
    const blendRate = this.milestone20Active ? 2.6 : 1.6;
    this.milestone20Blend += (targetBlend - this.milestone20Blend) * Math.min(1, blendRate * dt);
    if (this.milestone20Active) {
      this.milestone20Timer += dt;
      // Fallback timeout in case audio playback stops or ends
      if (this.milestone20Timer >= 22.0) {
        this.endMilestone20();
      }
    }

    this.track.update(dt, speed, this.runDistance);
    this.obstacles.update(dt, speed);
    const playerCollider = this.player.getCollider();
    this.collectibles.update(dt, speed, {
      playerCollider,
      magnetActive: this.powerUps.isMagnetActive,
      magnetRadius: this.powerUps.magnetRadius,
      playerX: playerCollider.centerX,
      playerY: playerCollider.centerY,
    });
    this.powerUps.update(dt, speed, playerCollider);
    this.powerUps.updateTimers(dt);
    this.effects.update(dt);
    this.resolveCollisions(playerCollider);

    const isShieldOn = this.powerUps.isShieldActive;
    this.activeShieldBubble.visible = isShieldOn;
    if (isShieldOn) {
      this.activeShieldBubble.rotation.y += dt * 1.8;
    }

    const speedRatio = speed / this.difficulty.maxSpeed;
    this.chase.update(dt, {
      playerX: this.player.x,
      playerLane: this.player.lane,
      speed,
      pressure: this.difficulty.pressure,
      active: true,
      isStumbling: this.player.isStumbling,
      farBackground: this.milestone20Blend > 0.05,
    });

    if (this.milestone20Blend > 0.001) {
      this.cameraController.setRunningCloseUpPose(
        this.milestone20Blend,
        this.cameraTarget(),
        speedRatio,
      );
    } else {
      this.cameraController.update(dt, this.cameraTarget(), speedRatio);
    }
    this.syncShadowCamera();

    this.hudAccumulator += dt;
    if (this.hudAccumulator >= 0.1) {
      this.hudAccumulator = 0;
      this.updateHud();
    }
  }

  /**
   * Opening 'vlog then chased' intro: walk the staging timer through its beats.
   *
   * Beat 1 (0 .. revealAtSeconds) - Veeramani films his vlog, facing the lens.
   * Beat 2 (revealAtSeconds .. cutAtSeconds) - the two delivery boys are spotted
   * and rush in from behind the camera.
   * Beat 3 (cutAtSeconds) - he runs and the endless run begins.
   */
  private advanceIntro(dt: number): void {
    const intro = GameConfig.intro;
    this.introTimer += dt;

    if (this.introTimer >= intro.cutAtSeconds) {
      this.beginRunFromIntro();
      return;
    }

    if (this.introPhase < 1 && this.introTimer >= intro.revealAtSeconds) {
      this.introPhase = 1;
      this.ui.vlog.setAlarmed(true);
      this.ui.vlog.setLine(VLOG_ALARM_LINE, 'Delivery-Boy 1 and 2 are on your heels');
      this.audio.play('crash', 0.45);
      this.ui.announce(VLOG_ALARM_LINE);
    }
  }

  /**
   * 0 during the vlog beat, ramping smoothly to 1 by the moment the run starts.
   * One value drives the whole beat: the runner turns away from the lens, the
   * boys close in and the framing widens back out to the road ahead.
   */
  private introCharge(): number {
    const intro = GameConfig.intro;
    const linear = clamp01(
      (this.introTimer - intro.revealAtSeconds) / (intro.cutAtSeconds - intro.revealAtSeconds),
    );
    return linear * linear * (3 - 2 * linear);
  }

  private simulateIntro(dt: number): void {
    const intro = GameConfig.intro;
    const charge = this.introCharge();

    // The runner waves his right hand to the audience during Beat 1, then smoothly
    // lowers his hand and spins around to run as the boys arrive in Beat 2.
    const waveAmount = Math.max(0, 1 - charge * 1.6);
    this.player.setWave(waveAmount);
    this.player.update(dt, 0);
    this.player.object3D.rotation.y = Math.PI * (1 - charge);

    // The boys wait out of shot beyond the camera, then charge into frame. They
    // arrive a little ahead of the runner (1.5x the beat) so they are properly
    // framed and closing for the last stretch instead of popping in at the cut.
    const arrival = clamp01(charge * 1.5);
    this.chase.setVisible(true);
    this.chase.setDistance(intro.boysHiddenZ + (intro.boysChargeZ - intro.boysHiddenZ) * arrival);
    this.chase
      .update(dt, {
        playerX: 0,
        playerLane: INTRO_LANE,
        speed: 11 + charge * 9,
        pressure: 0,
        active: false,
      });

    // Close-up vlog camera in Beat 1, smoothly moving back to behind view in Beat 2
    const closeUpBlend = 1 - charge;
    this.cameraController.setIntroVlogPose(closeUpBlend, this.cameraTarget());

    this.effects.update(dt);
    this.syncShadowCamera();
  }

  /**
   * Beat 3: start the endless run. The camera is already in its gameplay pose and
   * the boys are already at chase distance, so this only hands over control.
   */
  private beginRunFromIntro(): void {
    this.introPhase = 2;
    this.player.setWave(0);
    this.audio.stopIntroTrack();
    this.resetMilestone20();
    this.chase.setDistance(null);
    this.chase.reset();
    this.chase.setVisible(true);
    this.activeShieldBubble.visible = false;
    this.cameraController.addShake(0.16);

    this.state.transition('Playing');
    this.ui.setGameState('Playing');
    this.ui.announce(
      'Run started. Delivery-Boy 1 and Delivery-Boy 2 are chasing. Three lanes, jump the low barriers, slide under the banners.',
    );
    this.audio.play('start');
    this.audio.setAmbienceLevel(1);
    this.input.setEnabled(true);
  }

  private simulateAttract(dt: number): void {
    const speed = GameConfig.attractSpeed;
    this.player.setIdle(false);
    this.player.update(dt, speed);
    this.obstacles.update(dt, speed);
    // A ghost collider means nothing is collected while the menus are open.
    this.collectibles.update(dt, speed, {
      playerCollider: GHOST_COLLIDER,
      magnetActive: false,
      magnetRadius: 0,
      playerX: 0,
      playerY: 0,
    });
    this.powerUps.update(dt, speed, GHOST_COLLIDER);
    this.effects.update(dt);
    this.cameraController.update(dt, this.cameraTarget(), 0.2);
    this.syncShadowCamera();
  }

  private currentSpeed(): number {
    const boosted = this.difficulty.speedWith(this.powerUps.speedBonus);
    return Math.max(0.5, boosted * this.player.speedFactor);
  }

  private cameraTarget() {
    return { x: this.player.x, y: this.player.y, lane: this.player.lane };
  }

  private syncShadowCamera(): void {
    if (!this.sun.castShadow) return;
    // Keep the shadow frustum tight around the action so shadows stay crisp.
    this.sun.position.set(this.player.x - 9, 16, 7);
    this.sun.target.position.set(this.player.x, 0, -6);
    this.sun.target.updateMatrixWorld();
  }

  private resolveCollisions(playerCollider: Collider): void {
    if (this.player.isInvulnerable || this.player.isGameOver) return;
    for (const hazard of this.obstacles.active) {
      if (hazard.resolved) continue;
      const box = this.obstacles.colliderFor(hazard);
      if (!boxesOverlap(playerCollider, box)) continue;
      hazard.resolved = true;

      if (this.powerUps.consumeShield()) {
        this.audio.play('shieldBlock');
        this.effects.pop(box.centerX, box.centerY, box.centerZ, Palette.shield, 1.6, 0.36);
        this.player.grantInvulnerability(GameConfig.powerUps.shieldBlockInvulnerability);
        this.obstacles.despawn(hazard);
        this.ui.announce('Shield absorbed the crash');
        return;
      }

      const { gameOver } = this.difficulty.registerCrash();
      this.effects.pop(box.centerX, box.centerY, box.centerZ, Palette.crash, 1.4, 0.34);
      this.cameraController.addShake(0.32);
      if (gameOver) {
        this.endRun('Two crashes without recovering - the riders closed in.');
      } else {
        this.player.stumble();
        this.audio.play('crash');
        this.ui.announce('Stumbled. The riders are closing in.');
      }
      return;
    }
  }

  private updateHud(): void {
    this.ui.hud.setScore(this.score.score);
    this.ui.hud.setTokens(this.score.tokens);
    this.ui.hud.setBest(this.score.best);
    this.ui.hud.setBadges(this.powerUps.listActive());
    this.ui.hud.setPressure(this.difficulty.pressure);
  }

  private endRun(reason: string): void {
    this.resetMilestone20();
    this.player.setGameOver();
    this.audio.play('gameOver', 1.2);
    this.audio.setAmbienceLevel(0.2);
    const result = this.score.finish();
    this.lastRunResult = result;
    this.lastRunTime = this.runTime;
    this.updateHud();
    this.ui.showGameOver({ ...result, reason });
    this.state.transition('GameOver');
    this.ui.setGameState('GameOver');
    this.input.setEnabled(false);
    this.chase.setVisible(true);
    this.ui.announce(`Run over. Score ${result.score}. Best ${result.best}.`);

    // Automatically submit score using the runner username set in the Main Menu
    const runnerName = this.leaderboard.getPlayerName();
    this.ui.gameover.showSaving(runnerName);

    void (async () => {
      const res = await this.leaderboard.submitScore({
        name: runnerName,
        score: result.score,
        distance: result.distance,
        tokens: result.tokens,
        runTimeSeconds: Math.max(1, Math.floor(this.lastRunTime)),
      });

      if (res.success) {
        const rankMsg = res.localRank
          ? `Saved as ${runnerName} • Rank #${res.localRank}`
          : `Saved to Leaderboard as ${runnerName}!`;
        this.ui.gameover.showSaved(rankMsg, true);
        this.ui.announce(rankMsg);
      } else {
        this.ui.gameover.showSaved(`Recorded locally as ${runnerName}`, false);
      }
    })();
  }

  private triggerMilestone20(): void {
    this.milestone20Triggered = true;
    this.milestone20Active = true;
    this.milestone20Timer = 0;

    // Clear all existing obstacles from the road and pause hazard spawning
    this.obstacles.clearActive();
    this.track.setHazardSpawnEnabled(false);

    // Play 'after 20.mp3'
    this.audio.playAfter20Track(after20AudioUrl, () => {
      this.endMilestone20();
    });

    this.ui.announce('20 seconds reached! Delivery boys in pursuit!');
  }

  private endMilestone20(): void {
    if (!this.milestone20Active) return;
    this.milestone20Active = false;
    this.audio.stopAfter20Track();
    this.track.setHazardSpawnEnabled(true);
  }

  private resetMilestone20(): void {
    this.runTime = 0;
    this.milestone20Triggered = false;
    this.milestone20Active = false;
    this.milestone20Timer = 0;
    this.milestone20Blend = 0;
    this.audio.stopAfter20Track();
    this.track.setHazardSpawnEnabled(true);
  }

  private render(deltaSeconds = 0): void {
    if (deltaSeconds > 0) {
      const instantFps = 1 / deltaSeconds;
      this.smoothedFps = this.smoothedFps === 0 ? instantFps : this.smoothedFps * 0.92 + instantFps * 0.08;
    }
    this.renderer.render(this.scene, this.cameraController.camera);
  }

  private resize(): void {
    const canvas = this.options.canvas;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.cameraController.setAspect(width / Math.max(1, height));
    const camera: PerspectiveCamera = this.cameraController.camera;
    camera.updateProjectionMatrix();
  }

  private onVisibilityChange(visible: boolean): void {
    if (!visible && this.state.isPlaying()) {
      this.pause();
    }
  }

  private readonly handleResize = (): void => this.resize();
  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.pause();
    this.ui.announce('Graphics context lost. Press resume to continue.');
  };

  private addEventListeners(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    this.options.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.input.attach();
    this.unbindTouchPad = bindTouchPad(
      document,
      (action) => this.handleAction(action),
      () => this.state.isPlaying(),
    );
  }

  private unbindTouchPad: () => void = () => {};

  private removeEventListeners(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    this.options.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.unbindTouchPad();
  }

  /** Exposed for tests and debugging. */
  get debugState(): GameStateName {
    return this.state.current;
  }

  get debugDistance(): number {
    return this.runDistance;
  }

  get debugHazardCount(): number {
    return this.obstacles.count;
  }

  /**
   * One structured snapshot of the whole run, used by the browser tests and
   * handy in the dev console: `__SANTHAI__.debugSnapshot`.
   */
  get debugSnapshot(): {
    state: GameStateName;
    distance: number;
    score: number;
    tokens: number;
    best: number;
    speed: number;
    tier: number;
    pressure: number;
    hazards: number;
    tokensOnTrack: number;
    pickups: number;
    segmentOrigins: number[];
    chaseDistance: number;
    fps: number;
    player: {
      lane: number;
      x: number;
      y: number;
      motion: string;
      sliding: boolean;
      grounded: boolean;
      invulnerable: boolean;
      gameOver: boolean;
      jumps: number;
    };
    activePowerUps: string[];
  } {
    return {
      state: this.state.current,
      distance: Math.round(this.runDistance),
      score: this.score.score,
      tokens: this.score.tokens,
      best: this.score.best,
      speed: Number(this.currentSpeed().toFixed(2)),
      tier: this.difficulty.tier,
      pressure: Number(this.difficulty.pressure.toFixed(3)),
      hazards: this.obstacles.count,
      tokensOnTrack: this.collectibles.count,
      pickups: this.powerUps.count,
      segmentOrigins: this.track.segmentOrigins.map((z) => Math.round(z * 100) / 100),
      chaseDistance: Number(this.chase.pressureDistance.toFixed(2)),
      fps: Math.round(this.smoothedFps),
      player: {
        lane: this.player.lane,
        x: Number(this.player.x.toFixed(3)),
        y: Number(this.player.y.toFixed(3)),
        motion: this.player.motionState,
        sliding: this.player.isSliding,
        grounded: this.player.isGrounded,
        invulnerable: this.player.isInvulnerable,
        gameOver: this.player.isGameOver,
        jumps: this.player.jumps,
      },
      activePowerUps: this.powerUps.listActive().map((item) => item.kind),
    };
  }

  /** Test hook: force the run to end (browser tests use this). */
  debugForceGameOver(reason = 'Debug: run ended.'): void {
    if (this.state.isPlaying()) this.endRun(reason);
  }

  /** Test hook: grant a power-up without hunting for the pickup. */
  debugGrantPowerUp(kind: PowerUpKind): void {
    this.powerUps.activate(kind);
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** A fresh seed per run, unless the app was constructed with a fixed one. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xfffffff);
}

export function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
  return hasTouch;
}
