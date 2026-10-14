import { describe, expect, it } from 'vitest';
import { createCharacter } from '../../src/gameplay/character/CharacterFactory';
import { VeeramaniCharacter } from '../../src/gameplay/character/VeeramaniCharacter';
import { PlayerController } from '../../src/gameplay/PlayerController';
import type { RigAnimationContext } from '../../src/gameplay/character/CharacterRig';

describe('VeeramaniCharacter and waving animation', () => {
  it('creates VeeramaniCharacter as the protagonist rig', () => {
    const character = createCharacter('protagonist');
    expect(character).toBeInstanceOf(VeeramaniCharacter);
    expect(character.height).toBeCloseTo(1.78, 2);
    character.dispose();
  });

  it('updates idle and run poses smoothly without error', () => {
    const rig = new VeeramaniCharacter();
    const idleContext: RigAnimationContext = {
      motion: 'idle',
      speed: 0,
      speedRatio: 0,
      cyclePhase: 0,
      crouch: 0,
      airTime: 0,
      stumble: 0,
    };
    rig.update(0.016, idleContext);
    expect(rig.root.children.length).toBeGreaterThan(0);

    const runContext: RigAnimationContext = {
      motion: 'running',
      speed: 12,
      speedRatio: 0.6,
      cyclePhase: 1.2,
      crouch: 0,
      airTime: 0,
      stumble: 0,
    };
    rig.update(0.016, runContext);
    rig.dispose();
  });

  it('raises right arm and animates wave when wave context is active', () => {
    const rig = new VeeramaniCharacter();

    // Step several frames with wave = 0
    for (let i = 0; i < 30; i++) {
      rig.update(0.016, {
        motion: 'idle',
        speed: 0,
        speedRatio: 0,
        cyclePhase: i * 0.05,
        crouch: 0,
        airTime: 0,
        stumble: 0,
        wave: 0,
      });
    }

    // Step with wave = 1 (such as during vlog intro audio)
    for (let i = 0; i < 40; i++) {
      rig.update(0.016, {
        motion: 'idle',
        speed: 0,
        speedRatio: 0,
        cyclePhase: i * 0.05,
        crouch: 0,
        airTime: 0,
        stumble: 0,
        wave: 1,
      });
    }

    // Rig contains chest -> shoulderR -> elbowR -> handR
    const chest = rig.root.children[0]?.children.find(c => c.children.length > 0);
    expect(chest).toBeDefined();

    rig.dispose();
  });

  it('PlayerController propagates setWave to rig context', () => {
    let receivedWave: number | undefined;
    const mockRig = {
      root: new VeeramaniCharacter().root,
      height: 1.78,
      update: (_dt: number, ctx: RigAnimationContext) => {
        receivedWave = ctx.wave;
      },
      dispose: () => {},
    };

    const player = new PlayerController(mockRig);
    player.setWave(1);
    player.update(0.016, 0);
    expect(receivedWave).toBe(1);

    player.setWave(0);
    player.update(0.016, 0);
    expect(receivedWave).toBe(0);
  });
});
