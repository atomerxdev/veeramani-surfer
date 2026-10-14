import { beforeEach, describe, expect, it } from 'vitest';
import { GameConfig, laneToX } from '../../src/app/GameConfig';
import { boxesOverlap, type Collider } from '../../src/gameplay/CollisionSystem';
import { createCharacter } from '../../src/gameplay/character/CharacterFactory';
import { PlayerController } from '../../src/gameplay/PlayerController';
import { ObstacleManager } from '../../src/gameplay/ObstacleManager';
import { HAZARD_DEFINITIONS, hazardHalfExtents } from '../../src/gameplay/HazardCatalog';
import { Group } from 'three';

const STEP = 1 / 60;

function box(overrides: Partial<Collider> = {}): Collider {
  return {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    halfWidth: 0.5,
    halfHeight: 0.5,
    halfDepth: 0.5,
    ...overrides,
  };
}

/** Hazard hitbox as the game builds it, in world space at a given lane/z. */
function hazardBox(kind: keyof typeof HAZARD_DEFINITIONS, lane: number, z: number): Collider {
  const extents = hazardHalfExtents(kind);
  return {
    centerX: laneToX(lane),
    centerY: extents.centerYOffset,
    centerZ: z,
    halfWidth: extents.halfWidth,
    halfHeight: extents.halfHeight,
    halfDepth: extents.halfDepth,
  };
}

describe('boxesOverlap', () => {
  it('detects overlapping and separated boxes', () => {
    expect(boxesOverlap(box(), box())).toBe(true);
    expect(boxesOverlap(box(), box({ centerX: 2 }))).toBe(false);
    expect(boxesOverlap(box(), box({ centerY: 1 }))).toBe(false);
    expect(boxesOverlap(box(), box({ centerZ: 1 }))).toBe(false);
  });

  it('counts a touching face as separated (no sticky contacts)', () => {
    expect(boxesOverlap(box(), box({ centerX: 1 }))).toBe(false);
    expect(boxesOverlap(box(), box({ centerX: 0.99 }))).toBe(true);
  });
});

describe('hazard hitbox semantics', () => {
  it('a jump barrier is cleared by jumping, but not by sliding', () => {
    const barrier = hazardBox('lowBarrier', 1, 0);
    const standing = box({ centerY: 0.89, halfHeight: 0.89, halfWidth: 0.36, halfDepth: 0.35 });
    const jumping = box({ centerY: 1.65, halfHeight: 0.89, halfWidth: 0.36, halfDepth: 0.35 });
    const sliding = box({ centerY: 0.475, halfHeight: 0.475, halfWidth: 0.36, halfDepth: 0.35 });

    expect(boxesOverlap(standing, barrier)).toBe(true);
    expect(boxesOverlap(jumping, barrier)).toBe(false);
    expect(boxesOverlap(sliding, barrier)).toBe(true);
  });

  it('an overhead barrier is cleared by sliding, but not by standing or jumping', () => {
    const barrier = hazardBox('overheadBarrier', 1, 0);
    const standing = box({ centerY: 0.89, halfHeight: 0.89, halfWidth: 0.36, halfDepth: 0.35 });
    const sliding = box({ centerY: 0.475, halfHeight: 0.475, halfWidth: 0.36, halfDepth: 0.35 });
    const groundedJump = box({ centerY: 1.4, halfHeight: 0.89, halfWidth: 0.36, halfDepth: 0.35 });

    expect(boxesOverlap(standing, barrier)).toBe(true);
    expect(boxesOverlap(sliding, barrier)).toBe(false);
    expect(boxesOverlap(groundedJump, barrier)).toBe(true);
  });

  it('a lane blocker cannot be jumped, and is only cleared by changing lane', () => {
    const blocker = hazardBox('crateStack', 1, 0);
    for (const centerY of [0.89, 1.4, 1.9, 2.5]) {
      const player = box({ centerY, halfHeight: 0.89, halfWidth: 0.36, halfDepth: 0.35 });
      expect(boxesOverlap(player, blocker)).toBe(true);
    }
    const inNextLane = box({
      centerX: laneToX(2),
      centerY: 0.89,
      halfHeight: 0.89,
      halfWidth: 0.36,
      halfDepth: 0.35,
    });
    expect(boxesOverlap(inNextLane, blocker)).toBe(false);
  });

  it('hitboxes match the documented catalogue sizes', () => {
    for (const definition of Object.values(HAZARD_DEFINITIONS)) {
      const extents = hazardHalfExtents(definition.kind);
      expect(extents.halfWidth * 2).toBeCloseTo(definition.width, 6);
      expect(extents.halfHeight * 2).toBeCloseTo(definition.height, 6);
      expect(extents.halfDepth * 2).toBeCloseTo(definition.depth, 6);
      expect(extents.centerYOffset).toBeCloseTo(definition.baseY + definition.height / 2, 6);
    }
  });
});

describe('PlayerController collide-and-protect behaviour', () => {
  let player: PlayerController;

  beforeEach(() => {
    player = new PlayerController(createCharacter('protagonist'));
  });

  const step = (seconds: number): void => {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i += 1) player.update(STEP, GameConfig.difficulty.baseSpeed);
  };

  it('starts grounded in the middle lane with a standing collider', () => {
    const collider = player.getCollider();
    expect(player.isGrounded).toBe(true);
    expect(player.motionState).toBe('running');
    expect(collider.halfHeight * 2).toBeCloseTo(GameConfig.player.standHeight, 6);
    expect(collider.centerY).toBeCloseTo(GameConfig.player.standHeight / 2, 6);
  });

  it('follows a controlled jump arc and lands', () => {
    player.requestJump();
    step(0.02);
    expect(player.isGrounded).toBe(false);
    expect(player.motionState).toBe('jumping');

    let peak = 0;
    for (let i = 0; i < 60; i += 1) {
      player.update(STEP, GameConfig.difficulty.baseSpeed);
      peak = Math.max(peak, player.y);
    }
    // v^2 / 2g = 11.6^2 / 68 ~= 1.98 m
    expect(peak).toBeGreaterThan(1.8);
    expect(peak).toBeLessThan(2.2);
    expect(player.isGrounded).toBe(true);
    expect(player.y).toBe(0);
  });

  it('a well-timed jump carries the runner over a low barrier', () => {
    // The player stays at z = 0 and the world scrolls toward +Z, so the hazard's
    // world Z is what moves. 6.5 m ahead is the sweet spot for a 12.5 m/s run.
    const speed = GameConfig.difficulty.baseSpeed;
    const startZ = -6.5;
    const barrier = hazardBox('lowBarrier', 1, startZ);

    const runHeadless = (jump: boolean): boolean => {
      const subject = new PlayerController(createCharacter('protagonist'));
      if (jump) subject.requestJump();
      let collided = false;
      for (let i = 1; i <= 120; i += 1) {
        subject.update(STEP, speed);
        const z = startZ + speed * i * STEP;
        if (boxesOverlap(subject.getCollider(), { ...barrier, centerZ: z })) collided = true;
      }
      return collided;
    };

    expect(runHeadless(true)).toBe(false);
    // Control: without the jump the same barrier is a crash.
    expect(runHeadless(false)).toBe(true);
  });

  it('a well-timed jump cannot clear a lane blocker', () => {
    const speed = GameConfig.difficulty.baseSpeed;
    const startZ = -6.5;
    const blocker = hazardBox('crateStack', 1, startZ);
    const subject = new PlayerController(createCharacter('protagonist'));
    subject.requestJump();
    let collided = false;
    for (let i = 1; i <= 120; i += 1) {
      subject.update(STEP, speed);
      const z = startZ + speed * i * STEP;
      if (boxesOverlap(subject.getCollider(), { ...blocker, centerZ: z })) collided = true;
    }
    expect(collided).toBe(true);
  });

  it('slides for the configured duration and then stands up', () => {
    player.requestSlide();
    step(0.02);
    expect(player.isSliding).toBe(true);
    expect(player.motionState).toBe('sliding');
    const collider = player.getCollider();
    expect(collider.halfHeight * 2).toBeCloseTo(GameConfig.player.slideHeight, 6);

    step(GameConfig.player.slideDuration + 0.05);
    expect(player.isSliding).toBe(false);
    expect(player.getCollider().halfHeight * 2).toBeCloseTo(GameConfig.player.standHeight, 6);
  });

  it('never lets jump and slide fight over the same frame', () => {
    // Slide then jump: the slide is cancelled, the jump wins.
    player.requestSlide();
    step(0.02);
    expect(player.isSliding).toBe(true);
    player.requestJump();
    step(0.02);
    expect(player.isGrounded).toBe(false);
    expect(player.isSliding).toBe(false);

    // Jump then slide: the slide is ignored while airborne (not queued).
    expect(player.isSliding).toBe(false);
    player.requestSlide();
    step(0.01);
    expect(player.isSliding).toBe(false);

    // ...and sliding works again once grounded.
    step(1.2);
    player.requestSlide();
    step(0.02);
    expect(player.isSliding).toBe(true);
  });

  it('keeps the hitbox on the real interpolated position during a lane change', () => {
    player.requestLane(-1);
    step(0.02);
    const collider = player.getCollider();
    // Mid-change the hitbox is between the two lane centres, not snapped.
    expect(collider.centerX).toBeGreaterThan(laneToX(0) + 0.01);
    expect(collider.centerX).toBeLessThan(0);
    expect(player.lane).toBe(0);
  });

  it('blocking a lane change at the road edge is refused', () => {
    expect(player.requestLane(-1)).toBe(true);
    expect(player.requestLane(-1)).toBe(false);
  });

  it('becomes briefly invulnerable after a stumble', () => {
    player.stumble();
    expect(player.isStumbling).toBe(true);
    expect(player.isInvulnerable).toBe(true);
    expect(player.speedFactor).toBeLessThan(1);
    step(GameConfig.player.invulnerableTime + 0.1);
    expect(player.isInvulnerable).toBe(false);
    expect(player.isStumbling).toBe(false);
    expect(player.speedFactor).toBe(1);
  });

  it('reset() clears every timer', () => {
    player.requestJump();
    player.stumble();
    player.reset();
    expect(player.isStumbling).toBe(false);
    expect(player.isInvulnerable).toBe(false);
    expect(player.isGrounded).toBe(true);
    expect(player.y).toBe(0);
    expect(player.lane).toBe(1);
    expect(player.isGameOver).toBe(false);
  });

  it('ignores commands once the run is over', () => {
    player.setGameOver();
    expect(player.requestLane(-1)).toBe(false);
    expect(player.motionState).toBe('gameover');
    expect(player.speedFactor).toBe(0);
  });
});

describe('ObstacleManager', () => {
  it('spawns, scrolls and recycles hazards into a pool', () => {
    const root = new Group();
    const obstacles = new ObstacleManager(root);
    obstacles.spawn('crateStack', 1, -30, 0);
    obstacles.spawn('lowBarrier', 0, -40, 0);
    expect(obstacles.count).toBe(2);

    // Scroll until both are behind the cull line.
    for (let i = 0; i < 60 * 6; i += 1) obstacles.update(1 / 60, 20);
    expect(obstacles.count).toBe(0);
    expect(obstacles.pooledCount).toBe(2);
    expect(root.children.length).toBe(2); // reused, not re-created
  });

  it('releases only the hazards owned by a recycled segment', () => {
    const obstacles = new ObstacleManager(new Group());
    obstacles.spawn('crateStack', 1, -30, 0);
    obstacles.spawn('lowBarrier', 0, -30, 1);
    obstacles.releaseByOwner(0);
    expect(obstacles.active.map((hazard) => hazard.ownerId)).toEqual([1]);
  });
});
