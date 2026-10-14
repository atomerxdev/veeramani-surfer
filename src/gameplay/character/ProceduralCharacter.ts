/**
 * Procedural placeholder character.
 *
 * Built entirely from shared primitives so the project has zero required art
 * assets. Proportions are deliberately cartoonish (big head, chunky shoes, short
 * torso) to match the stylized mobile-game look.
 *
 * The rig is an additive pose blender: each frame it builds a weighted average of
 * the run cycle, slide, jump, stumble and game-over poses. Because the poses are
 * weighted rather than exclusive, state changes cross-fade smoothly and two
 * states can never fight over a joint.
 */

import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { CharacterRig, MotionState, RigAnimationContext } from './CharacterRig';

export interface CharacterPalette {
  readonly skin: number;
  readonly hair: number;
  readonly shirt: number;
  readonly sleeves: number;
  readonly trousers: number;
  readonly shoes: number;
  readonly accent: number;
  readonly headwear: 'hair' | 'cap' | 'helmet';
  readonly accessory: 'sling' | 'backpack' | 'none';
  /** Extra scale, used to make the chase riders slightly bulkier. */
  readonly scale?: number;
}

/** Veeramani: the vlogger in the teal kurta, yellow sling bag and cheeky hair tuft. */
export const PROTAGONIST_PALETTE: CharacterPalette = {
  skin: 0xc98a5b,
  hair: 0x241a14,
  shirt: 0x1f8a8f,
  sleeves: 0x14646a,
  trousers: 0x37414f,
  shoes: 0xf2f2f2,
  accent: 0xffc94a,
  headwear: 'hair',
  accessory: 'sling',
};

/**
 * Delivery-Boy 1: tall, orange uniform shirt, dark helmet, food-delivery box on
 * his back. The bright orange is intentionally the loudest colour on screen so a
 * glance at the frame tells you he is closing in.
 */
export const DELIVERY_BOY_1_PALETTE: CharacterPalette = {
  skin: 0xc98a5b,
  hair: 0x1b1410,
  shirt: 0xf2500f,
  sleeves: 0xc43c08,
  trousers: 0x2b3340,
  shoes: 0x21262e,
  accent: 0xfdf6e6,
  headwear: 'helmet',
  accessory: 'backpack',
  scale: 1.06,
};

/**
 * Delivery-Boy 2: shorter, red uniform shirt, yellow cap and a second delivery
 * box. Same family as his partner but a different silhouette, so you can always
 * tell which of the two is on your heels.
 */
export const DELIVERY_BOY_2_PALETTE: CharacterPalette = {
  skin: 0xb5774a,
  hair: 0x241a14,
  shirt: 0xd8291b,
  sleeves: 0xac1d12,
  trousers: 0x333d4d,
  shoes: 0xf2f2f2,
  accent: 0xffc93c,
  headwear: 'cap',
  accessory: 'backpack',
  scale: 1,
};

/** Back-compat aliases for the pre-'delivery boy' naming. */
export const RIDER_PALETTE: CharacterPalette = DELIVERY_BOY_1_PALETTE;
export const DELIVERY_BOY_PALETTE: CharacterPalette = DELIVERY_BOY_1_PALETTE;

/* ------------------------------------------------------------------ geometry */

/**
 * Geometry is shared between every character instance (there are only two) so
 * repeated runs never allocate new buffers.
 */
const geometryCache = new Map<string, BufferGeometry>();

function geo(key: string, build: () => BufferGeometry): BufferGeometry {
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const created = build();
  geometryCache.set(key, created);
  return created;
}

/** Release the shared geometry cache (only when the whole app shuts down). */
export function disposeSharedCharacterGeometry(): void {
  for (const geometry of geometryCache.values()) geometry.dispose();
  geometryCache.clear();
}

/* ---------------------------------------------------------------------- pose */

interface PoseNumbers {
  bodyX: number;
  bodyY: number;
  bodyZ: number;
  bodyRotX: number;
  bodyRotY: number;
  bodyRotZ: number;
  headX: number;
  headY: number;
  shoulderLX: number;
  shoulderLZ: number;
  shoulderRX: number;
  shoulderRZ: number;
  elbowL: number;
  elbowR: number;
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
}

const POSE_KEYS: readonly (keyof PoseNumbers)[] = [
  'bodyX',
  'bodyY',
  'bodyZ',
  'bodyRotX',
  'bodyRotY',
  'bodyRotZ',
  'headX',
  'headY',
  'shoulderLX',
  'shoulderLZ',
  'shoulderRX',
  'shoulderRZ',
  'elbowL',
  'elbowR',
  'hipL',
  'hipR',
  'kneeL',
  'kneeR',
];

function emptyPose(): PoseNumbers {
  return {
    bodyX: 0,
    bodyY: 0,
    bodyZ: 0,
    bodyRotX: 0,
    bodyRotY: 0,
    bodyRotZ: 0,
    headX: 0,
    headY: 0,
    shoulderLX: 0,
    shoulderLZ: 0,
    shoulderRX: 0,
    shoulderRZ: 0,
    elbowL: 0,
    elbowR: 0,
    hipL: 0,
    hipR: 0,
    kneeL: 0,
    kneeR: 0,
  };
}

function accumulate(target: PoseNumbers, pose: PoseNumbers, weight: number): number {
  if (weight <= 0) return 0;
  for (const key of POSE_KEYS) target[key] += pose[key] * weight;
  return weight;
}

const TAU = Math.PI * 2;

/** Keep a cycle phase bounded so it never loses float precision. */
export function wrapPhase(phase: number): number {
  return phase % TAU;
}

/* ----------------------------------------------------------------------- rig */

export class ProceduralCharacter implements CharacterRig {
  readonly root: Group;
  readonly height: number;

  private readonly body = new Group();
  private readonly hips = new Group();
  private readonly torso = new Group();
  private readonly head = new Group();
  private readonly shoulderL = new Group();
  private readonly shoulderR = new Group();
  private readonly elbowL = new Group();
  private readonly elbowR = new Group();
  private readonly hipL = new Group();
  private readonly hipR = new Group();
  private readonly kneeL = new Group();
  private readonly kneeR = new Group();

  private readonly materials: MeshLambertMaterial[] = [];

  // Pose accumulation buffers (allocated once, reused every frame).
  private readonly cyclePose = emptyPose();
  private readonly slidePose = emptyPose();
  private readonly jumpPose = emptyPose();
  private readonly stumblePose = emptyPose();
  private readonly gameOverPose = emptyPose();
  private readonly idlePose = emptyPose();
  private readonly blended = emptyPose();

  // Self-smoothed blend weights.
  private airWeight = 0;
  private stumbleWeight = 0;
  private gameOverWeight = 0;

  constructor(private readonly palette: CharacterPalette) {
    this.root = new Group();
    this.root.name = 'character';
    const scale = 0.94 * (palette.scale ?? 1);
    this.root.scale.setScalar(scale);
    this.height = 1.78;

    this.buildPoses();
    this.buildBody();
  }

  update(dt: number, context: RigAnimationContext): void {
    // 1. Smooth the "event" weights (jump / stumble / game over).
    const airTarget = context.airTime > 0.02 && context.motion !== 'sliding' ? 1 : 0;
    const stumbleTarget = context.motion === 'stumble' ? 1 : 0;
    const gameOverTarget = context.motion === 'gameover' ? 1 : 0;
    this.airWeight = approach(this.airWeight, airTarget, 9, dt);
    this.stumbleWeight = approach(this.stumbleWeight, stumbleTarget, 7, dt);
    this.gameOverWeight = approach(this.gameOverWeight, gameOverTarget, 3.2, dt);

    const crouch = clamp01(context.crouch);
    const eventWeight =
      Math.min(1, this.airWeight + this.stumbleWeight + this.gameOverWeight + crouch);
    const cycleWeight = clamp01(1 - eventWeight);

    // 2. Fill the running/idle poses from the current cycle phase.
    const cycle = context.motion === 'idle' ? this.idlePose : this.cyclePose;
    if (context.motion !== 'idle') this.writeRunPose(cycle, context);

    // 3. Weighted average.
    for (const key of POSE_KEYS) this.blended[key] = 0;
    let total = 0;
    total += accumulate(this.blended, cycle, cycleWeight);
    total += accumulate(this.blended, this.slidePose, crouch);
    total += accumulate(this.blended, this.jumpPose, this.airWeight);
    total += accumulate(this.blended, this.stumblePose, this.stumbleWeight);
    total += accumulate(this.blended, this.gameOverPose, this.gameOverWeight);
    if (total <= 0) total = 1;
    const inverse = 1 / total;

    // 4. Apply.
    const p = this.blended;
    this.body.position.set(p.bodyX * inverse, p.bodyY * inverse, p.bodyZ * inverse);
    this.body.rotation.set(p.bodyRotX * inverse, p.bodyRotY * inverse, p.bodyRotZ * inverse);
    this.head.rotation.set(p.headX * inverse, p.headY * inverse, 0);
    this.shoulderL.rotation.set(p.shoulderLX * inverse, 0, p.shoulderLZ * inverse);
    this.shoulderR.rotation.set(p.shoulderRX * inverse, 0, p.shoulderRZ * inverse);
    this.elbowL.rotation.x = p.elbowL * inverse;
    this.elbowR.rotation.x = p.elbowR * inverse;
    this.hipL.rotation.x = p.hipL * inverse;
    this.hipR.rotation.x = p.hipR * inverse;
    this.kneeL.rotation.x = p.kneeL * inverse;
    this.kneeR.rotation.x = p.kneeR * inverse;
  }

  dispose(): void {
    for (const material of this.materials) material.dispose();
    this.materials.length = 0;
    this.root.clear();
  }

  /* ------------------------------------------------------------ pose authoring */

  private buildPoses(): void {
    // Slide: the body rotates almost flat and the legs stretch forward.
    const slide = this.slidePose;
    slide.bodyRotX = 1.26;
    slide.bodyZ = -0.34;
    slide.bodyY = 0.02;
    slide.headX = -0.34;
    slide.hipL = 0.16;
    slide.hipR = -0.06;
    slide.kneeL = -0.12;
    slide.kneeR = -0.3;
    slide.shoulderLX = -0.9;
    slide.shoulderRX = -0.75;
    slide.shoulderLZ = 0.22;
    slide.shoulderRZ = -0.22;
    slide.elbowL = -0.5;
    slide.elbowR = -0.5;

    // Jump: leading knee up, trailing leg back, arms flung up and back.
    const jump = this.jumpPose;
    jump.bodyRotX = 0.16;
    jump.bodyY = 0.02;
    jump.headX = -0.12;
    jump.hipL = 0.85;
    jump.hipR = -0.3;
    jump.kneeL = -1.15;
    jump.kneeR = -0.45;
    jump.shoulderLX = -2.25;
    jump.shoulderRX = -2.05;
    jump.shoulderLZ = 0.3;
    jump.shoulderRZ = -0.3;
    jump.elbowL = -0.45;
    jump.elbowR = -0.45;

    // Stumble: reel backwards, arms flailing up.
    const stumble = this.stumblePose;
    stumble.bodyRotX = -0.24;
    stumble.bodyRotZ = 0.14;
    stumble.bodyY = -0.03;
    stumble.headX = -0.3;
    stumble.hipL = -0.42;
    stumble.hipR = 0.55;
    stumble.kneeL = -0.9;
    stumble.kneeR = -0.7;
    stumble.shoulderLX = -2.5;
    stumble.shoulderRX = -2.15;
    stumble.shoulderLZ = 0.55;
    stumble.shoulderRZ = -0.55;
    stumble.elbowL = -0.7;
    stumble.elbowR = -0.6;

    // Game over: sit down, defeated.
    const over = this.gameOverPose;
    over.bodyRotX = 0.46;
    over.bodyY = -0.3;
    over.headX = -0.28;
    over.hipL = 1.25;
    over.hipR = 1.1;
    over.kneeL = -1.7;
    over.kneeR = -1.55;
    over.shoulderLX = 0.5;
    over.shoulderRX = 0.42;
    over.shoulderLZ = 0.3;
    over.shoulderRZ = -0.3;
    over.elbowL = -0.85;
    over.elbowR = -0.8;

    // Idle: breathing, tiny weight shift.
    const idle = this.idlePose;
    idle.bodyY = 0.012;
    idle.bodyRotX = 0.02;
    idle.headX = -0.04;
    idle.shoulderLZ = 0.13;
    idle.shoulderRZ = -0.13;
    idle.elbowL = -0.28;
    idle.elbowR = -0.28;
    idle.hipL = 0.03;
    idle.hipR = -0.03;
    idle.kneeL = -0.06;
    idle.kneeR = -0.06;
  }

  private writeRunPose(pose: PoseNumbers, context: RigAnimationContext): void {
    const p = context.cyclePhase;
    const sin = Math.sin(p);
    const sinOpposite = Math.sin(p + Math.PI);
    const effort = 0.55 + 0.45 * clamp01(context.speedRatio);
    const swing = 0.95 * effort;

    pose.bodyY = -0.02 + Math.abs(Math.sin(p)) * 0.05 * effort;
    pose.bodyRotX = 0.15 + 0.06 * clamp01(context.speedRatio);
    pose.bodyRotY = 0;
    pose.bodyRotZ = 0;
    pose.headX = -0.12;
    pose.headY = sin * 0.07;

    pose.hipL = sin * swing;
    pose.hipR = sinOpposite * swing;
    pose.kneeL = -(0.15 + 0.9 * Math.max(0, -sin)) * effort;
    pose.kneeR = -(0.15 + 0.9 * Math.max(0, -sinOpposite)) * effort;

    pose.shoulderLX = sinOpposite * 0.8 * effort;
    pose.shoulderRX = sin * 0.8 * effort;
    pose.shoulderLZ = 0.1;
    pose.shoulderRZ = -0.1;
    pose.elbowL = -(0.85 + 0.25 * effort);
    pose.elbowR = -(0.85 + 0.25 * effort);
  }

  /* ---------------------------------------------------------------- body build */

  private material(color: number): MeshLambertMaterial {
    const material = new MeshLambertMaterial({ color });
    this.materials.push(material);
    return material;
  }

  private part(
    parent: Object3D,
    geometry: BufferGeometry,
    material: MeshLambertMaterial,
    x = 0,
    y = 0,
    z = 0,
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  private buildBody(): void {
    const skin = this.material(this.palette.skin);
    const hair = this.material(this.palette.hair);
    const shirt = this.material(this.palette.shirt);
    const sleeves = this.material(this.palette.sleeves);
    const trousers = this.material(this.palette.trousers);
    const shoes = this.material(this.palette.shoes);
    const accent = this.material(this.palette.accent);
    const dark = this.material(0x1b1512);

    this.root.add(this.body);
    this.body.add(this.hips);
    this.body.add(this.torso);

    // ---- hips
    this.hips.position.y = 0.88;
    this.part(this.hips, geo('hips', () => new BoxGeometry(0.5, 0.24, 0.32)), trousers, 0, 0.0);

    // ---- torso
    this.torso.position.y = 0.98;
    this.part(this.torso, geo('torso', () => new BoxGeometry(0.58, 0.56, 0.34)), shirt, 0, 0.24);
    this.part(this.torso, geo('collar', () => new BoxGeometry(0.6, 0.08, 0.36)), accent, 0, 0.5);
    this.part(
      this.torso,
      geo('neck', () => new CapsuleGeometry(0.075, 0.06, 4, 8)),
      skin,
      0,
      0.56,
    );

    // ---- head
    this.head.position.set(0, 0.62, 0);
    this.torso.add(this.head);
    this.part(this.head, geo('skull', () => new SphereGeometry(0.235, 16, 12)), skin, 0, 0.1);
    this.part(
      this.head,
      geo('ears', () => new SphereGeometry(0.05, 8, 6)),
      skin,
      0.23,
      0.09,
      0,
    );
    this.part(
      this.head,
      geo('ears', () => new SphereGeometry(0.05, 8, 6)),
      skin,
      -0.23,
      0.09,
      0,
    );
    // Face (the character faces -Z).
    for (const side of [-1, 1] as const) {
      this.part(
        this.head,
        geo('eye', () => new SphereGeometry(0.036, 8, 6)),
        dark,
        side * 0.085,
        0.14,
        -0.212,
      );
      this.part(
        this.head,
        geo('brow', () => new BoxGeometry(0.075, 0.022, 0.02)),
        hair,
        side * 0.088,
        0.2,
        -0.205,
      );
    }
    this.part(
      this.head,
      geo('nose', () => new SphereGeometry(0.032, 8, 6)),
      skin,
      0,
      0.09,
      -0.23,
    );
    this.part(
      this.head,
      geo('smile', () => new TorusGeometry(0.055, 0.014, 6, 12, Math.PI)),
      dark,
      0,
      0.045,
      -0.215,
    ).rotation.z = Math.PI;

    if (this.palette.headwear === 'hair') {
      const cap = this.part(
        this.head,
        geo('hair', () => new SphereGeometry(0.245, 14, 10)),
        hair,
        0,
        0.14,
        0.02,
      );
      cap.scale.set(1, 0.68, 1.02);
      // Cheeky front tuft: the vlogger's signature.
      this.part(
        this.head,
        geo('tuft', () => new SphereGeometry(0.07, 8, 6)),
        hair,
        0.02,
        0.32,
        -0.13,
      );
    } else if (this.palette.headwear === 'cap') {
      const dome = this.part(
        this.head,
        geo('cap', () => new SphereGeometry(0.25, 14, 10)),
        accent,
        0,
        0.14,
        0.02,
      );
      dome.scale.set(1, 0.6, 1.02);
      this.part(
        this.head,
        geo('brim', () => new BoxGeometry(0.36, 0.03, 0.2)),
        accent,
        0,
        0.13,
        -0.26,
      );
    } else {
      const dome = this.part(
        this.head,
        geo('helmet', () => new SphereGeometry(0.27, 14, 12)),
        accent,
        0,
        0.12,
        0.015,
      );
      dome.scale.set(1.02, 0.92, 1.08);
      this.part(
        this.head,
        geo('visor', () => new BoxGeometry(0.34, 0.075, 0.16)),
        dark,
        0,
        0.08,
        -0.235,
      );
    }

    // ---- arms
    for (const side of ['L', 'R'] as const) {
      const isLeft = side === 'L';
      const shoulder = isLeft ? this.shoulderL : this.shoulderR;
      const elbow = isLeft ? this.elbowL : this.elbowR;
      shoulder.position.set((isLeft ? -1 : 1) * 0.35, 0.44, 0);
      this.torso.add(shoulder);
      this.part(
        shoulder,
        geo('upperArm', () => new CapsuleGeometry(0.078, 0.2, 4, 8)),
        sleeves,
        0,
        -0.17,
      );
      elbow.position.set(0, -0.34, 0);
      shoulder.add(elbow);
      this.part(elbow, geo('foreArm', () => new CapsuleGeometry(0.07, 0.18, 4, 8)), skin, 0, -0.16);
      this.part(elbow, geo('hand', () => new SphereGeometry(0.082, 8, 6)), skin, 0, -0.33);
    }

    // ---- legs
    for (const side of ['L', 'R'] as const) {
      const isLeft = side === 'L';
      const hip = isLeft ? this.hipL : this.hipR;
      const knee = isLeft ? this.kneeL : this.kneeR;
      hip.position.set((isLeft ? -1 : 1) * 0.16, 0.88, 0);
      this.body.add(hip);
      this.part(hip, geo('thigh', () => new CapsuleGeometry(0.098, 0.25, 4, 8)), trousers, 0, -0.22);
      knee.position.set(0, -0.44, 0);
      hip.add(knee);
      this.part(knee, geo('shin', () => new CapsuleGeometry(0.086, 0.2, 4, 8)), skin, 0, -0.18);
      this.part(
        knee,
        geo('shoe', () => new BoxGeometry(0.17, 0.12, 0.32)),
        shoes,
        0,
        -0.4,
        -0.05,
      );
      this.part(
        knee,
        geo('shoeStripe', () => new BoxGeometry(0.175, 0.035, 0.1)),
        accent,
        0,
        -0.43,
        -0.14,
      );
    }

    // ---- accessory
    if (this.palette.accessory === 'sling') {
      this.part(
        this.torso,
        geo('sling', () => new BoxGeometry(0.24, 0.3, 0.13)),
        accent,
        0.3,
        0.1,
        0.13,
      );
      const strap = this.part(
        this.torso,
        geo('strap', () => new BoxGeometry(0.07, 0.62, 0.06)),
        accent,
        0.16,
        0.28,
        0.13,
      );
      strap.rotation.z = 0.42;
    } else if (this.palette.accessory === 'backpack') {
      this.part(
        this.torso,
        geo('backpack', () => new BoxGeometry(0.44, 0.46, 0.22)),
        accent,
        0,
        0.28,
        0.26,
      );
      this.part(
        this.torso,
        geo('backpackStripe', () => new BoxGeometry(0.46, 0.06, 0.24)),
        dark,
        0,
        0.2,
        0.265,
      );
    }
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Frame-rate independent approach toward a target weight. */
function approach(current: number, target: number, lambda: number, dt: number): number {
  const next = current + (target - current) * (1 - Math.exp(-lambda * dt));
  return Math.abs(target - next) < 1e-4 ? target : next;
}

export type { MotionState };
