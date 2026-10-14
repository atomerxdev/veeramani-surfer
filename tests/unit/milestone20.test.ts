import { describe, expect, it, vi } from 'vitest';
import { CameraController } from '../../src/gameplay/CameraController';
import { ChaseManager } from '../../src/gameplay/ChaseManager';
import { ObstacleManager } from '../../src/gameplay/ObstacleManager';
import { TrackManager } from '../../src/gameplay/TrackManager';
import { CollectibleManager } from '../../src/gameplay/CollectibleManager';
import { PowerUpManager } from '../../src/gameplay/PowerUpManager';
import { DifficultyManager } from '../../src/gameplay/DifficultyManager';
import { AudioManager } from '../../src/core/AudioManager';
import { GameConfig } from '../../src/app/GameConfig';
import { Group } from 'three';

describe('20-Second Running Close-Up Milestone', () => {
  it('interpolates CameraController to running close-up pose with pursuers in background', () => {
    const camera = new CameraController(GameConfig);
    const target = { x: 0, y: 0, lane: 0 };

    // At blend 0: normal behind-the-runner camera pose
    camera.setRunningCloseUpPose(0, target, 0.5);
    const behindZ = camera.camera.position.z;
    expect(behindZ).toBeCloseTo(GameConfig.camera.offsetZ, 1);

    // At blend 1: front-facing close-up shot placed in front of runner at -Z looking back at +Z
    camera.setRunningCloseUpPose(1, target, 0.5);
    const closeZ = camera.camera.position.z;
    expect(closeZ).toBeLessThan(0); // in front of runner
    expect(closeZ).toBeCloseTo(-1.65, 1);
    expect(camera.camera.position.y).toBeCloseTo(1.42, 1); // head/chest height
  });

  it('keeps delivery boys visible in far background when farBackground context is true', () => {
    const root = new Group();
    const chase = new ChaseManager(root);

    // On normal clean run without pressure, riders are hidden
    chase.update(0.1, {
      playerX: 0,
      playerLane: 0,
      speed: 12,
      pressure: 0,
      active: true,
      isStumbling: false,
      farBackground: false,
    });

    // During 20s milestone, farBackground is true: riders become visible far away
    for (let i = 0; i < 20; i++) {
      chase.update(0.1, {
        playerX: 0,
        playerLane: 0,
        speed: 12,
        pressure: 0,
        active: true,
        isStumbling: false,
        farBackground: true,
      });
    }

    expect(chase.pressureDistance).toBeGreaterThan(10);
    expect(chase.pressureDistance).toBeCloseTo(11.2, 0.5);

    chase.dispose();
  });

  it('clears active obstacles and disables spawning when hazardSpawnEnabled is false', () => {
    const root = new Group();
    const obstacles = new ObstacleManager(root);
    const collectibles = new CollectibleManager(root);
    const powerUps = new PowerUpManager(root);
    const difficulty = new DifficultyManager();

    const track = new TrackManager({
      root,
      obstacles,
      collectibles,
      powerUps,
      difficulty,
      getQuality: () => GameConfig.quality.high,
    });

    track.reset(42);
    // Hazards should be present initially
    expect(obstacles.count).toBeGreaterThan(0);

    // 20s milestone triggers: clear all active obstacles and pause spawning
    obstacles.clearActive();
    expect(obstacles.count).toBe(0);

    track.setHazardSpawnEnabled(false);
    expect(track.isHazardSpawnEnabled).toBe(false);

    // Advance track: no new obstacles spawn while disabled
    for (let i = 0; i < 50; i++) {
      track.update(0.05, 15, i * 15 * 0.05);
    }
    expect(obstacles.count).toBe(0);

    // Resume hazard spawning after milestone ends
    track.setHazardSpawnEnabled(true);
    expect(track.isHazardSpawnEnabled).toBe(true);

    track.dispose();
    obstacles.dispose();
    collectibles.dispose();
    powerUps.dispose();
  });

  it('AudioManager plays and stops after20 track properly', () => {
    const audio = new AudioManager({ masterVolume: 0.8 });
    const onEnded = vi.fn();

    // Calling playAfter20Track with null/fake Audio shouldn't throw in Node environment
    expect(() => {
      audio.playAfter20Track('assets/after-20.mp3', onEnded);
    }).not.toThrow();

    expect(() => {
      audio.setMuted(true);
      audio.setVolume(0.5);
      audio.stopAfter20Track();
      audio.dispose();
    }).not.toThrow();
  });
});
