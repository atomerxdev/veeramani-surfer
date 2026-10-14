import { describe, expect, it, vi } from 'vitest';
import { GameConfig, laneToX } from '../../src/app/GameConfig';
import { Group } from 'three';
import { PowerUpManager, type PowerUpKind } from '../../src/gameplay/PowerUpManager';
import type { Collider } from '../../src/gameplay/CollisionSystem';

const STEP = 1 / 60;

function makeManager(): { manager: PowerUpManager; expire: ReturnType<typeof vi.fn> } {
  const expire = vi.fn<(kind: PowerUpKind) => void>();
  const manager = new PowerUpManager(new Group(), GameConfig, undefined, expire);
  return { manager, expire };
}

function playerAt(lane: number): Collider {
  return {
    centerX: laneToX(lane),
    centerY: 0.89,
    centerZ: 0,
    halfWidth: 0.36,
    halfHeight: 0.89,
    halfDepth: 0.35,
  };
}

function tick(manager: PowerUpManager, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) manager.updateTimers(STEP);
}

describe('PowerUpManager effects', () => {
  it('starts with nothing active', () => {
    const { manager } = makeManager();
    expect(manager.listActive()).toHaveLength(0);
    expect(manager.scoreMultiplier).toBe(1);
    expect(manager.speedBonus).toBe(0);
    expect(manager.isShieldActive).toBe(false);
  });

  it('expires each effect after exactly its configured duration', () => {
    const durations: Record<PowerUpKind, number> = {
      shield: GameConfig.powerUps.shieldDuration,
      magnet: GameConfig.powerUps.magnetDuration,
      multiplier: GameConfig.powerUps.multiplierDuration,
      boost: GameConfig.powerUps.boostDuration,
    };
    for (const kind of Object.keys(durations) as PowerUpKind[]) {
      const { manager } = makeManager();
      manager.activate(kind);
      expect(manager.isActive(kind)).toBe(true);
      tick(manager, durations[kind] - 0.2);
      expect(manager.isActive(kind)).toBe(true);
      tick(manager, 0.4);
      expect(manager.isActive(kind)).toBe(false);
    }
  });

  it('reports the expiry once, not every frame', () => {
    const { manager, expire } = makeManager();
    manager.activate('shield');
    tick(manager, GameConfig.powerUps.shieldDuration + 1);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith('shield');
  });

  it('refreshes instead of stacking when picked up again', () => {
    const { manager } = makeManager();
    manager.activate('multiplier');
    const first = manager.remaining('multiplier');
    manager.activate('multiplier');
    expect(manager.remaining('multiplier')).toBeCloseTo(first, 6);
    // A refreshed effect never exceeds its configured duration.
    expect(manager.remaining('multiplier')).toBeLessThanOrEqual(
      GameConfig.powerUps.multiplierDuration,
    );
  });

  it('exposes a bounded multiplier value and boost bonus', () => {
    const { manager } = makeManager();
    manager.activate('multiplier');
    manager.activate('multiplier');
    expect(manager.scoreMultiplier).toBe(GameConfig.powerUps.multiplierValue);
    manager.activate('boost');
    expect(manager.speedBonus).toBe(GameConfig.powerUps.boostSpeedBonus);
  });

  it('consumes the shield exactly once', () => {
    const { manager } = makeManager();
    manager.activate('shield');
    expect(manager.consumeShield()).toBe(true);
    expect(manager.consumeShield()).toBe(false);
    expect(manager.isShieldActive).toBe(false);
  });

  it('clear() drops every effect and pickup (nothing survives a restart)', () => {
    const { manager } = makeManager();
    manager.activate('boost');
    manager.spawn('shield', 0, -30, 0);
    manager.clear();
    expect(manager.listActive()).toHaveLength(0);
    expect(manager.count).toBe(0);
    expect(manager.isActive('boost')).toBe(false);
  });

  it('grants the effect when the player runs into a pickup', () => {
    const picked: PowerUpKind[] = [];
    const manager = new PowerUpManager(new Group(), GameConfig, (kind) => picked.push(kind));
    manager.spawn('magnet', 1, 0, 0);
    manager.update(STEP, GameConfig.difficulty.baseSpeed, playerAt(1));
    expect(picked).toEqual(['magnet']);
    expect(manager.isMagnetActive).toBe(true);
    expect(manager.count).toBe(0);
  });

  it('ignores pickups in other lanes', () => {
    const manager = new PowerUpManager(new Group(), GameConfig);
    manager.spawn('shield', 0, 0, 0);
    manager.update(STEP, 0, playerAt(2));
    expect(manager.isShieldActive).toBe(false);
    expect(manager.count).toBe(1);
  });

  it('recycles pickups that scroll behind the camera', () => {
    const manager = new PowerUpManager(new Group(), GameConfig);
    manager.spawn('shield', 1, -10, 3);
    // 30 m/s for 2 s carries it well past the cull line at +26 m.
    for (let i = 0; i < 120; i += 1) manager.update(STEP, 30, playerAt(0));
    expect(manager.count).toBe(0);
    expect(manager.releaseByOwner(3)).toBeUndefined();
  });

  it('releases a pickup owned by a recycled segment', () => {
    const manager = new PowerUpManager(new Group(), GameConfig);
    manager.spawn('shield', 0, -40, 7);
    manager.spawn('magnet', 2, -45, 8);
    manager.releaseByOwner(7);
    expect(manager.active.map((pickup) => pickup.ownerId)).toEqual([8]);
  });

  it('lists active effects with a 0..1 remaining ratio for the HUD', () => {
    const { manager } = makeManager();
    manager.activate('shield');
    tick(manager, GameConfig.powerUps.shieldDuration / 2);
    const [active] = manager.listActive();
    expect(active?.kind).toBe('shield');
    expect(active?.ratio).toBeGreaterThan(0.4);
    expect(active?.ratio).toBeLessThan(0.6);
  });
});
