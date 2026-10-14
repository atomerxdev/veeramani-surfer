import { describe, expect, it } from 'vitest';
import { GameConfig, laneToX } from '../../src/app/GameConfig';
import { LaneSystem } from '../../src/gameplay/LaneSystem';

describe('LaneSystem', () => {
  it('starts centred in the middle lane', () => {
    const lanes = new LaneSystem();
    expect(lanes.lane).toBe(1);
    expect(lanes.x).toBeCloseTo(0, 5);
    expect(lanes.isSettled).toBe(true);
  });

  it('maps lanes to symmetrical x positions', () => {
    expect(laneToX(0)).toBeCloseTo(-GameConfig.world.laneWidth, 5);
    expect(laneToX(1)).toBeCloseTo(0, 5);
    expect(laneToX(2)).toBeCloseTo(GameConfig.world.laneWidth, 5);
  });

  it('cannot move beyond the leftmost or rightmost lane', () => {
    const lanes = new LaneSystem();
    expect(lanes.move(-1)).toBe(true);
    expect(lanes.lane).toBe(0);
    // At the wall: the move is refused, and reports it so no sound plays.
    expect(lanes.move(-1)).toBe(false);
    expect(lanes.lane).toBe(0);
    expect(lanes.move(1)).toBe(true);
    expect(lanes.move(1)).toBe(true);
    expect(lanes.lane).toBe(2);
    expect(lanes.move(1)).toBe(false);
    expect(lanes.lane).toBe(2);
  });

  it('reports a lane change immediately so collisions stay predictable', () => {
    const lanes = new LaneSystem();
    lanes.move(-1);
    // The gameplay lane snaps...
    expect(lanes.lane).toBe(0);
    // ...while the visual position is still travelling.
    expect(lanes.x).toBeGreaterThan(laneToX(0));
    expect(lanes.isSettled).toBe(false);
  });

  it('settles onto the lane centre after enough simulated time', () => {
    const lanes = new LaneSystem();
    lanes.move(1);
    for (let step = 0; step < 60; step += 1) lanes.update(1 / 60);
    expect(lanes.x).toBeCloseTo(laneToX(2), 4);
    expect(lanes.isSettled).toBe(true);
  });

  it('is frame-rate independent', () => {
    const fast = new LaneSystem();
    const slow = new LaneSystem();
    fast.move(-1);
    slow.move(-1);
    for (let i = 0; i < 120; i += 1) fast.update(1 / 240);
    for (let i = 0; i < 30; i += 1) slow.update(1 / 60);
    expect(fast.x).toBeCloseTo(slow.x, 6);
  });

  it('reset() returns to the requested lane instantly', () => {
    const lanes = new LaneSystem();
    lanes.move(1);
    lanes.reset(0);
    expect(lanes.lane).toBe(0);
    expect(lanes.x).toBeCloseTo(laneToX(0), 5);
    expect(lanes.isSettled).toBe(true);
  });
});
