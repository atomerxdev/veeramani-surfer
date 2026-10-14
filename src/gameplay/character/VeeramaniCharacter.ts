/**
 * Veeramani — Realistic 3D Character Rig.
 *
 * A high-fidelity, anatomically proportioned 3D character modeled directly after
 * the reference photos of the famous Tamil vlogger Veeramani:
 * - Authentic facial likeness: signature thick Tamil mustache, expressive dark eyes,
 *   arched brows, defined jawline and subtle 5 o'clock stubble.
 * - Realistic adult male human proportions (1.78m height, 1:7.2 head-to-body ratio).
 * - Detailed smart-casual attire: collared teal kurta with woven fabric texture,
 *   3D collar wings, button placket, rolled-up sleeve cuffs, slate denim trousers.
 * - Iconic vlogger cross-body sling bag with buckle and camera clip.
 * - Contoured athletic running sneakers with thick cushioned soles.
 * - PBR materials (MeshStandardMaterial) responding dynamically to sun and ambient lighting.
 * - Smooth skeletal joint kinematics and pose blending for running, jumping, sliding,
 *   stumbling, and idle vlog gestures.
 */

import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { CharacterRig, RigAnimationContext } from './CharacterRig';
import {
  createVeeramaniFaceTexture,
  createVeeramaniShirtTexture,
  createVeeramaniSneakerTexture,
  createVeeramaniTrousersTexture,
} from './VeeramaniTextures';

/* ------------------------------------------------------------------ geometry */

const geometryCache = new Map<string, BufferGeometry>();

function geo(key: string, build: () => BufferGeometry): BufferGeometry {
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const created = build();
  geometryCache.set(key, created);
  return created;
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
  headZ: number;
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
  'headZ',
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
    headZ: 0,
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

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function approach(current: number, target: number, lambda: number, dt: number): number {
  const next = current + (target - current) * (1 - Math.exp(-lambda * dt));
  return Math.abs(target - next) < 1e-4 ? target : next;
}

/* ----------------------------------------------------------------------- rig */

export class VeeramaniCharacter implements CharacterRig {
  readonly root: Group;
  readonly height: number = 1.78;

  // Hierarchical skeletal joints
  private readonly body = new Group();
  private readonly pelvis = new Group();
  private readonly spine = new Group();
  private readonly chest = new Group();
  private readonly neck = new Group();
  private readonly head = new Group();

  private readonly shoulderL = new Group();
  private readonly shoulderR = new Group();
  private readonly elbowL = new Group();
  private readonly elbowR = new Group();
  private readonly handR = new Group();

  private readonly hipL = new Group();
  private readonly hipR = new Group();
  private readonly kneeL = new Group();
  private readonly kneeR = new Group();

  private readonly materials: MeshStandardMaterial[] = [];

  // Poses for smooth blending
  private readonly cyclePose = emptyPose();
  private readonly slidePose = emptyPose();
  private readonly jumpPose = emptyPose();
  private readonly stumblePose = emptyPose();
  private readonly gameOverPose = emptyPose();
  private readonly idlePose = emptyPose();
  private readonly blended = emptyPose();

  private airWeight = 0;
  private stumbleWeight = 0;
  private gameOverWeight = 0;
  private waveWeight = 0;
  private waveTimer = 0;

  constructor() {
    this.root = new Group();
    this.root.name = 'veeramani-character';

    this.buildPoses();
    this.buildBody();
  }

  update(dt: number, context: RigAnimationContext): void {
    // 1. Smooth event weights
    const airTarget = context.airTime > 0.02 && context.motion !== 'sliding' ? 1 : 0;
    const stumbleTarget = context.motion === 'stumble' ? 1 : 0;
    const gameOverTarget = context.motion === 'gameover' ? 1 : 0;
    this.airWeight = approach(this.airWeight, airTarget, 9, dt);
    this.stumbleWeight = approach(this.stumbleWeight, stumbleTarget, 7, dt);
    this.gameOverWeight = approach(this.gameOverWeight, gameOverTarget, 3.2, dt);

    const waveTarget = clamp01(context.wave ?? 0);
    this.waveWeight = approach(this.waveWeight, waveTarget, 7.5, dt);
    if (this.waveWeight > 0.001) {
      this.waveTimer += dt;
    } else {
      this.waveTimer = 0;
    }

    const crouch = clamp01(context.crouch);
    const eventWeight = Math.min(
      1,
      this.airWeight + this.stumbleWeight + this.gameOverWeight + crouch,
    );
    const cycleWeight = clamp01(1 - eventWeight);

    // 2. Compute dynamic cycle pose or idle
    const cycle = context.motion === 'idle' ? this.idlePose : this.cyclePose;
    if (context.motion !== 'idle') {
      this.writeRunPose(cycle, context);
    } else {
      this.writeIdlePose(this.idlePose, context);
    }

    // 3. Weighted accumulation
    for (const key of POSE_KEYS) this.blended[key] = 0;
    let total = 0;
    total += accumulate(this.blended, cycle, cycleWeight);
    total += accumulate(this.blended, this.slidePose, crouch);
    total += accumulate(this.blended, this.jumpPose, this.airWeight);
    total += accumulate(this.blended, this.stumblePose, this.stumbleWeight);
    total += accumulate(this.blended, this.gameOverPose, this.gameOverWeight);
    if (total <= 0) total = 1;
    const inv = 1 / total;

    // 4. Apply poses to joint transforms
    const p = this.blended;
    this.body.position.set(p.bodyX * inv, p.bodyY * inv, p.bodyZ * inv);
    this.body.rotation.set(p.bodyRotX * inv, p.bodyRotY * inv, p.bodyRotZ * inv);

    this.head.rotation.set(p.headX * inv, p.headY * inv, p.headZ * inv);

    this.shoulderL.rotation.set(p.shoulderLX * inv, 0, p.shoulderLZ * inv);
    this.shoulderR.rotation.set(p.shoulderRX * inv, 0, p.shoulderRZ * inv);
    this.elbowL.rotation.x = p.elbowL * inv;
    this.elbowR.rotation.x = p.elbowR * inv;

    this.hipL.rotation.x = p.hipL * inv;
    this.hipR.rotation.x = p.hipR * inv;
    this.kneeL.rotation.x = p.kneeL * inv;
    this.kneeR.rotation.x = p.kneeR * inv;

    // 5. Audience greeting wave layer (active when vlog intro audio plays)
    if (this.waveWeight > 0.001) {
      const w = this.waveWeight;
      const wt = this.waveTimer * 8.2;
      const waveOsc = Math.sin(wt);
      const waveCos = Math.cos(wt);

      // Target waving joint angles for right arm
      const waveShoulderX = 1.30 + waveCos * 0.05;
      const waveShoulderY = -0.15;
      const waveShoulderZ = 0.62 + waveOsc * 0.08;

      const waveElbowX = 1.76 + waveCos * 0.06;
      const waveElbowY = -0.10;
      const waveElbowZ = waveOsc * 0.22;

      const waveHandX = 0.20 + waveCos * 0.05;
      const waveHandY = -0.38;
      const waveHandZ = 0.22 + waveOsc * 0.32;

      // Smoothly blend base pose with waving pose by weight w
      this.shoulderR.rotation.x = this.shoulderR.rotation.x * (1 - w) + waveShoulderX * w;
      this.shoulderR.rotation.y = this.shoulderR.rotation.y * (1 - w) + waveShoulderY * w;
      this.shoulderR.rotation.z = this.shoulderR.rotation.z * (1 - w) + waveShoulderZ * w;

      this.elbowR.rotation.x = this.elbowR.rotation.x * (1 - w) + waveElbowX * w;
      this.elbowR.rotation.y = this.elbowR.rotation.y * (1 - w) + waveElbowY * w;
      this.elbowR.rotation.z = this.elbowR.rotation.z * (1 - w) + waveElbowZ * w;

      this.handR.rotation.x = waveHandX * w;
      this.handR.rotation.y = waveHandY * w;
      this.handR.rotation.z = waveHandZ * w;

      // Natural subtle head tilt towards the waving hand for vlog charm
      this.head.rotation.z += -0.06 * w;
      this.head.rotation.y += 0.04 * w * waveOsc;
    } else {
      this.handR.rotation.set(0, 0, 0);
    }
  }

  dispose(): void {
    for (const material of this.materials) {
      if (material.map) material.map.dispose();
      material.dispose();
    }
    this.materials.length = 0;
    this.root.clear();
  }

  /* ------------------------------------------------------------ pose authoring */

  private buildPoses(): void {
    // Baseball / runner ground slide
    const slide = this.slidePose;
    slide.bodyRotX = 1.28;
    slide.bodyZ = -0.28;
    slide.bodyY = 0.05;
    slide.headX = -0.32;
    slide.hipL = 0.18;
    slide.hipR = -0.08;
    slide.kneeL = -0.15;
    slide.kneeR = -0.32;
    slide.shoulderLX = -0.85;
    slide.shoulderRX = -0.7;
    slide.shoulderLZ = 0.24;
    slide.shoulderRZ = -0.24;
    slide.elbowL = -0.55;
    slide.elbowR = -0.55;

    // Jump: athletic vault with tuck
    const jump = this.jumpPose;
    jump.bodyRotX = 0.14;
    jump.bodyY = 0.03;
    jump.headX = -0.1;
    jump.hipL = 0.82;
    jump.hipR = -0.28;
    jump.kneeL = -1.18;
    jump.kneeR = -0.42;
    jump.shoulderLX = -2.15;
    jump.shoulderRX = -1.95;
    jump.shoulderLZ = 0.28;
    jump.shoulderRZ = -0.28;
    jump.elbowL = -0.5;
    jump.elbowR = -0.5;

    // Stumble
    const stumble = this.stumblePose;
    stumble.bodyRotX = -0.26;
    stumble.bodyRotZ = 0.12;
    stumble.bodyY = -0.04;
    stumble.headX = -0.28;
    stumble.hipL = -0.38;
    stumble.hipR = 0.52;
    stumble.kneeL = -0.85;
    stumble.kneeR = -0.65;
    stumble.shoulderLX = -2.35;
    stumble.shoulderRX = -2.05;
    stumble.shoulderLZ = 0.5;
    stumble.shoulderRZ = -0.5;
    stumble.elbowL = -0.65;
    stumble.elbowR = -0.55;

    // Game over: collapsed sitting
    const over = this.gameOverPose;
    over.bodyRotX = 0.48;
    over.bodyY = -0.32;
    over.headX = -0.26;
    over.hipL = 1.28;
    over.hipR = 1.15;
    over.kneeL = -1.68;
    over.kneeR = -1.52;
    over.shoulderLX = 0.48;
    over.shoulderRX = 0.4;
    over.shoulderLZ = 0.28;
    over.shoulderRZ = -0.28;
    over.elbowL = -0.8;
    over.elbowR = -0.75;
  }

  private writeIdlePose(pose: PoseNumbers, context: RigAnimationContext): void {
    const t = context.cyclePhase;
    // Breathing & subtle vlogger gesture
    pose.bodyY = 0.015 + Math.sin(t * 1.5) * 0.008;
    pose.bodyRotX = 0.02 + Math.cos(t * 1.5) * 0.01;
    pose.headX = -0.04 + Math.sin(t * 0.8) * 0.03;
    pose.headY = Math.sin(t * 1.2) * 0.05;
    pose.shoulderLZ = 0.12;
    pose.shoulderRZ = -0.12;
    pose.shoulderLX = 0.1 + Math.sin(t) * 0.04;
    pose.shoulderRX = 0.1;
    pose.elbowL = -0.35 + Math.sin(t * 1.5) * 0.05;
    pose.elbowR = -0.3;
    pose.hipL = 0.03;
    pose.hipR = -0.03;
    pose.kneeL = -0.05;
    pose.kneeR = -0.05;
  }

  private writeRunPose(pose: PoseNumbers, context: RigAnimationContext): void {
    const p = context.cyclePhase;
    const sin = Math.sin(p);
    const sinOpposite = Math.sin(p + Math.PI);
    const effort = 0.55 + 0.45 * clamp01(context.speedRatio);
    const swing = 0.95 * effort;

    // Natural vertical bounce and forward drive lean
    pose.bodyY = -0.02 + Math.abs(sin) * 0.06 * effort;
    pose.bodyRotX = 0.14 + 0.08 * clamp01(context.speedRatio);
    // Subtle pelvic sway
    pose.bodyRotY = sin * 0.06 * effort;
    pose.bodyRotZ = -sin * 0.03 * effort;

    pose.headX = -0.1;
    pose.headY = sin * 0.06;
    pose.headZ = -sin * 0.03;

    // Legs: athletic alternating knee drive and extension
    pose.hipL = sin * swing;
    pose.hipR = sinOpposite * swing;
    pose.kneeL = -(0.18 + 0.95 * Math.max(0, -sin)) * effort;
    pose.kneeR = -(0.18 + 0.95 * Math.max(0, -sinOpposite)) * effort;

    // Arms: natural counter-swing with bent elbows
    pose.shoulderLX = sinOpposite * 0.85 * effort;
    pose.shoulderRX = sin * 0.85 * effort;
    pose.shoulderLZ = 0.12;
    pose.shoulderRZ = -0.12;
    pose.elbowL = -(0.85 + 0.3 * effort);
    pose.elbowR = -(0.85 + 0.3 * effort);
  }

  /* ---------------------------------------------------------------- body build */

  private createMaterial(options: {
    color?: number;
    roughness?: number;
    metalness?: number;
    map?: any;
  }): MeshStandardMaterial {
    const mat = new MeshStandardMaterial({
      roughness: options.roughness ?? 0.65,
      metalness: options.metalness ?? 0.04,
      ...options,
    });
    this.materials.push(mat);
    return mat;
  }

  private addMesh(
    parent: Object3D,
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    pos: [number, number, number] = [0, 0, 0],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private buildBody(): void {
    // 1. Textures & PBR Materials
    const faceTex = createVeeramaniFaceTexture();
    const shirtTex = createVeeramaniShirtTexture();
    const pantsTex = createVeeramaniTrousersTexture();
    const sneakerTex = createVeeramaniSneakerTexture();

    // Warm South Indian skin tone matching Veeramani reference photos
    const skinMat = this.createMaterial({
      color: 0x9b6442,
      roughness: 0.62,
      metalness: 0.04,
    });
    // Signature dark hair
    const hairMat = this.createMaterial({
      color: 0x1b130e,
      roughness: 0.38,
      metalness: 0.08,
    });
    // Mustache & facial hair 3D material
    const mustacheMat = this.createMaterial({
      color: 0x140c08,
      roughness: 0.45,
      metalness: 0.05,
    });
    // Face plane with custom high-res facial features
    const faceMat = this.createMaterial({
      map: faceTex,
      roughness: 0.58,
      metalness: 0.02,
    });
    // Teal patterned kurta / shirt
    const shirtMat = this.createMaterial({
      map: shirtTex,
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02,
    });
    // Rolled sleeves / dark teal accents
    const sleeveMat = this.createMaterial({
      color: 0x156368,
      roughness: 0.75,
      metalness: 0.02,
    });
    // Slate denim trousers
    const pantsMat = this.createMaterial({
      map: pantsTex,
      roughness: 0.82,
      metalness: 0.02,
    });
    // Running sneakers with athletic sole
    const sneakerMat = this.createMaterial({
      map: sneakerTex,
      roughness: 0.52,
      metalness: 0.04,
    });
    // Rubber shoe sole & toe
    const rubberMat = this.createMaterial({
      color: 0xf5f7fa,
      roughness: 0.48,
      metalness: 0.02,
    });
    // Vlogger sling bag (amber/gold)
    const slingMat = this.createMaterial({
      color: 0xfcb823,
      roughness: 0.38,
      metalness: 0.12,
    });
    // Metal buckles, camera & watch
    const metalMat = this.createMaterial({
      color: 0x2b313a,
      roughness: 0.22,
      metalness: 0.88,
    });

    // 2. Build skeletal hierarchy
    this.root.add(this.body);
    this.body.add(this.pelvis);
    this.body.add(this.spine);
    this.spine.add(this.chest);
    this.chest.add(this.neck);
    this.neck.add(this.head);

    // ------------------------------------------------------------- HIPS & PELVIS
    this.pelvis.position.y = 0.90;
    // Anatomical pelvic contour
    this.addMesh(
      this.pelvis,
      geo('pelvis', () => new CylinderGeometry(0.20, 0.17, 0.18, 16)),
      pantsMat,
      [0, 0, 0],
    );
    // Belt & metallic buckle
    this.addMesh(
      this.pelvis,
      geo('belt', () => new CylinderGeometry(0.205, 0.205, 0.035, 16)),
      metalMat,
      [0, 0.07, 0],
    );
    this.addMesh(
      this.pelvis,
      geo('buckle', () => new BoxGeometry(0.06, 0.04, 0.02)),
      this.createMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.9 }),
      [0, 0.07, -0.21],
    );

    // ------------------------------------------------------------- TORSO & CHEST
    this.spine.position.y = 0.98;
    // Abdomen / lower torso
    this.addMesh(
      this.spine,
      geo('abdomen', () => new CylinderGeometry(0.21, 0.19, 0.22, 16)),
      shirtMat,
      [0, 0.09, 0],
    );
    // Lower Kurta hemline draping over the trousers
    this.addMesh(
      this.spine,
      geo('kurtaHem', () => new CylinderGeometry(0.22, 0.23, 0.10, 16)),
      shirtMat,
      [0, -0.03, 0],
    );

    this.chest.position.y = 0.20;
    // Pectoral chest & upper torso taper
    this.addMesh(
      this.chest,
      geo('chest', () => new CylinderGeometry(0.235, 0.21, 0.24, 16)),
      shirtMat,
      [0, 0.12, 0],
    );

    // 3D Kurta Collar & Lapels
    this.addMesh(
      this.chest,
      geo('collarNeck', () => new CylinderGeometry(0.12, 0.14, 0.06, 16)),
      sleeveMat,
      [0, 0.24, 0],
    );
    // Folded collar wings on left and right
    this.addMesh(
      this.chest,
      geo('collarL', () => new BoxGeometry(0.09, 0.05, 0.02)),
      sleeveMat,
      [-0.06, 0.22, -0.13],
      [0.2, -0.3, 0.2],
    );
    this.addMesh(
      this.chest,
      geo('collarR', () => new BoxGeometry(0.09, 0.05, 0.02)),
      sleeveMat,
      [0.06, 0.22, -0.13],
      [0.2, 0.3, -0.2],
    );

    // ------------------------------------------------------------- NECK & HEAD
    this.neck.position.y = 0.24;
    // Anatomical neck
    this.addMesh(
      this.neck,
      geo('neck', () => new CylinderGeometry(0.082, 0.095, 0.14, 16)),
      skinMat,
      [0, 0.06, 0],
    );

    this.head.position.y = 0.12;
    // Cranium / head base (oval human head shape)
    this.addMesh(
      this.head,
      geo('cranium', () => new SphereGeometry(0.165, 24, 18)),
      skinMat,
      [0, 0.09, 0.01],
      [0, 0, 0],
      [0.96, 1.15, 1.02],
    );
    // Tapered masculine jaw & chin
    this.addMesh(
      this.head,
      geo('jaw', () => new CylinderGeometry(0.13, 0.095, 0.12, 16)),
      skinMat,
      [0, 0.015, -0.04],
      [0.22, 0, 0],
      [1.0, 1.0, 1.1],
    );
    // Rounded chin
    this.addMesh(
      this.head,
      geo('chin', () => new SphereGeometry(0.065, 14, 10)),
      skinMat,
      [0, -0.04, -0.095],
    );

    // Curved Front Face Plane with Veeramani's high-res likeness texture
    const faceMesh = this.addMesh(
      this.head,
      geo('facePlane', () => new PlaneGeometry(0.24, 0.26)),
      faceMat,
      [0, 0.05, -0.152],
      [0, Math.PI, 0], // Oriented towards -Z (runner facing forward)
    );
    faceMesh.castShadow = false;

    // 3D Sculpted Tamil Mustache (iconic Veeramani feature from reference photos)
    const mustacheGroup = new Group();
    mustacheGroup.position.set(0, 0.025, -0.158);
    this.head.add(mustacheGroup);
    // Center arch
    this.addMesh(
      mustacheGroup,
      geo('mustacheCenter', () => new TorusGeometry(0.048, 0.014, 8, 16, Math.PI * 0.9)),
      mustacheMat,
      [0, 0.01, 0],
      [0, 0, Math.PI * 1.05],
      [1.4, 0.7, 1.0],
    );
    // Left & right curved wings
    this.addMesh(
      mustacheGroup,
      geo('mustacheWing', () => new CapsuleGeometry(0.012, 0.04, 6, 8)),
      mustacheMat,
      [-0.048, -0.005, 0],
      [0, 0, 0.55],
    );
    this.addMesh(
      mustacheGroup,
      geo('mustacheWing', () => new CapsuleGeometry(0.012, 0.04, 6, 8)),
      mustacheMat,
      [0.048, -0.005, 0],
      [0, 0, -0.55],
    );

    // 3D Sculpted Nose
    this.addMesh(
      this.head,
      geo('noseTip', () => new SphereGeometry(0.022, 10, 8)),
      skinMat,
      [0, 0.065, -0.165],
    );
    this.addMesh(
      this.head,
      geo('noseBridge', () => new CapsuleGeometry(0.014, 0.05, 6, 8)),
      skinMat,
      [0, 0.095, -0.155],
      [0.2, 0, 0],
    );

    // 3D Sculpted Hair (thick dark hair styled with natural volume and side parting)
    this.addMesh(
      this.head,
      geo('hairCap', () => new SphereGeometry(0.174, 20, 16)),
      hairMat,
      [0, 0.11, 0.02],
      [0.08, 0, 0],
      [1.0, 1.12, 1.05],
    );
    // Front styled hair sweep
    this.addMesh(
      this.head,
      geo('hairFront', () => new SphereGeometry(0.09, 12, 8)),
      hairMat,
      [-0.03, 0.22, -0.06],
      [-0.2, 0.3, -0.2],
      [1.2, 0.6, 1.1],
    );
    this.addMesh(
      this.head,
      geo('hairFrontR', () => new SphereGeometry(0.08, 12, 8)),
      hairMat,
      [0.05, 0.21, -0.05],
      [-0.2, -0.2, 0.1],
      [1.1, 0.55, 1.0],
    );
    // Sideburns
    this.addMesh(
      this.head,
      geo('sideburn', () => new BoxGeometry(0.02, 0.08, 0.04)),
      hairMat,
      [-0.155, 0.07, -0.04],
      [0, 0, 0.1],
    );
    this.addMesh(
      this.head,
      geo('sideburn', () => new BoxGeometry(0.02, 0.08, 0.04)),
      hairMat,
      [0.155, 0.07, -0.04],
      [0, 0, -0.1],
    );

    // Anatomical 3D Ears
    for (const side of [-1, 1] as const) {
      this.addMesh(
        this.head,
        geo('ear', () => new TorusGeometry(0.032, 0.011, 6, 12, Math.PI * 1.3)),
        skinMat,
        [side * 0.165, 0.07, -0.01],
        [0, side > 0 ? 0.3 : -0.3, side > 0 ? -0.2 : 0.2],
      );
      this.addMesh(
        this.head,
        geo('earLobe', () => new SphereGeometry(0.015, 6, 6)),
        skinMat,
        [side * 0.165, 0.04, -0.01],
      );
    }

    // ------------------------------------------------------------- ARMS & HANDS
    for (const side of ['L', 'R'] as const) {
      const isL = side === 'L';
      const sign = isL ? -1 : 1;
      const shoulder = isL ? this.shoulderL : this.shoulderR;
      const elbow = isL ? this.elbowL : this.elbowR;

      shoulder.position.set(sign * 0.26, 0.16, 0);
      this.chest.add(shoulder);

      // Deltoid shoulder cap
      this.addMesh(
        shoulder,
        geo('deltoid', () => new SphereGeometry(0.075, 12, 10)),
        shirtMat,
        [0, 0, 0],
      );
      // Upper arm (kurta sleeve)
      this.addMesh(
        shoulder,
        geo('bicep', () => new CylinderGeometry(0.068, 0.062, 0.22, 12)),
        shirtMat,
        [0, -0.12, 0],
      );
      // Rolled-up sleeve cuff
      this.addMesh(
        shoulder,
        geo('sleeveCuff', () => new CylinderGeometry(0.072, 0.072, 0.045, 12)),
        sleeveMat,
        [0, -0.22, 0],
      );

      // Elbow joint
      elbow.position.set(0, -0.25, 0);
      shoulder.add(elbow);
      this.addMesh(
        elbow,
        geo('elbowJoint', () => new SphereGeometry(0.058, 10, 8)),
        skinMat,
        [0, 0, 0],
      );

      // Forearm (warm skin tone)
      this.addMesh(
        elbow,
        geo('forearm', () => new CylinderGeometry(0.056, 0.048, 0.22, 12)),
        skinMat,
        [0, -0.11, 0],
      );

      // Smartwatch / fitness tracker on right wrist
      if (!isL) {
        this.addMesh(
          elbow,
          geo('watchBand', () => new CylinderGeometry(0.052, 0.052, 0.035, 12)),
          metalMat,
          [0, -0.20, 0],
        );
        this.addMesh(
          elbow,
          geo('watchScreen', () => new BoxGeometry(0.035, 0.035, 0.015)),
          this.createMaterial({ color: 0x0a1015, roughness: 0.1, metalness: 0.95 }),
          [0, -0.20, -0.05],
        );
      }

      // Sculpted hand with palm, thumb and articulated fingers
      const handGroup = isL ? new Group() : this.handR;
      handGroup.position.set(0, -0.24, 0);
      elbow.add(handGroup);

      // Palm
      this.addMesh(
        handGroup,
        geo('palm', () => new BoxGeometry(0.062, 0.075, 0.035)),
        skinMat,
        [0, -0.03, 0],
      );
      // Thumb
      this.addMesh(
        handGroup,
        geo('thumb', () => new CapsuleGeometry(0.014, 0.04, 6, 6)),
        skinMat,
        [sign * -0.038, -0.02, -0.01],
        [0.2, 0, sign * 0.4],
      );
      // 4 articulated fingers with natural human proportions
      const fingerOffsets = [-0.021, -0.007, 0.007, 0.021];
      const fingerHeights = [0.044, 0.052, 0.049, 0.038];
      for (let f = 0; f < 4; f++) {
        this.addMesh(
          handGroup,
          geo(`finger_${f}`, () => new CapsuleGeometry(0.009, fingerHeights[f], 6, 8)),
          skinMat,
          [fingerOffsets[f], -0.068 - fingerHeights[f] * 0.25, 0.002],
          [0.15, 0, 0],
        );
      }
    }

    // ------------------------------------------------------------- LEGS & SHOES
    for (const side of ['L', 'R'] as const) {
      const isL = side === 'L';
      const sign = isL ? -1 : 1;
      const hip = isL ? this.hipL : this.hipR;
      const knee = isL ? this.kneeL : this.kneeR;

      hip.position.set(sign * 0.12, 0, 0);
      this.pelvis.add(hip);

      // Hip joint ball
      this.addMesh(
        hip,
        geo('hipJoint', () => new SphereGeometry(0.095, 12, 10)),
        pantsMat,
        [0, 0, 0],
      );
      // Thigh (tapered quadriceps in dark denim)
      this.addMesh(
        hip,
        geo('thigh', () => new CylinderGeometry(0.098, 0.078, 0.38, 14)),
        pantsMat,
        [0, -0.19, 0],
      );

      // Knee joint
      knee.position.set(0, -0.38, 0);
      hip.add(knee);
      this.addMesh(
        knee,
        geo('kneeJoint', () => new SphereGeometry(0.078, 12, 10)),
        pantsMat,
        [0, 0, 0],
      );
      // Calf / shin
      this.addMesh(
        knee,
        geo('calf', () => new CylinderGeometry(0.076, 0.062, 0.36, 14)),
        pantsMat,
        [0, -0.18, 0],
      );

      // Athletic Running Sneaker
      const footGroup = new Group();
      footGroup.position.set(0, -0.36, -0.02);
      knee.add(footGroup);

      // Sneaker Upper body
      this.addMesh(
        footGroup,
        geo('sneakerUpper', () => new BoxGeometry(0.125, 0.09, 0.26)),
        sneakerMat,
        [0, 0.04, -0.03],
      );
      // Contoured front toe cap
      this.addMesh(
        footGroup,
        geo('sneakerToe', () => new SphereGeometry(0.062, 12, 10)),
        rubberMat,
        [0, 0.025, -0.14],
        [0, 0, 0],
        [1.0, 0.7, 1.2],
      );
      // Thick cushioned rubber midsole/outsole
      this.addMesh(
        footGroup,
        geo('sneakerSole', () => new BoxGeometry(0.135, 0.045, 0.30)),
        rubberMat,
        [0, -0.015, -0.02],
      );
      // Heel tab / collar
      this.addMesh(
        footGroup,
        geo('sneakerHeel', () => new CylinderGeometry(0.06, 0.06, 0.06, 10)),
        sleeveMat,
        [0, 0.08, 0.08],
      );
    }

    // ------------------------------------------------------------- VLOGGER SLING BAG
    // The iconic yellow vlogger camera bag that sparks the street chase!
    const slingGroup = new Group();
    this.chest.add(slingGroup);

    // Cross-body diagonal strap across chest
    this.addMesh(
      slingGroup,
      geo('strapFront', () => new BoxGeometry(0.045, 0.52, 0.018)),
      slingMat,
      [0.05, 0.08, -0.225],
      [0.1, 0, 0.48],
    );
    // Back strap
    this.addMesh(
      slingGroup,
      geo('strapBack', () => new BoxGeometry(0.045, 0.52, 0.018)),
      slingMat,
      [0.05, 0.08, 0.225],
      [-0.1, 0, 0.48],
    );
    // Quick-release chest buckle
    this.addMesh(
      slingGroup,
      geo('strapBuckle', () => new BoxGeometry(0.055, 0.04, 0.025)),
      metalMat,
      [-0.04, 0.16, -0.228],
    );

    // Padded camera sling bag resting on his right hip
    const bagMesh = this.addMesh(
      slingGroup,
      geo('slingBag', () => new BoxGeometry(0.18, 0.24, 0.14)),
      slingMat,
      [0.26, -0.12, 0.10],
      [0.15, -0.25, 0.2],
    );
    // Front zip pocket
    this.addMesh(
      bagMesh,
      geo('bagPocket', () => new BoxGeometry(0.15, 0.14, 0.04)),
      this.createMaterial({ color: 0xe6a218, roughness: 0.4, metalness: 0.1 }),
      [0, -0.02, 0.08],
    );
    // Zipper metallic seam
    this.addMesh(
      bagMesh,
      geo('bagZip', () => new BoxGeometry(0.14, 0.015, 0.008)),
      metalMat,
      [0, 0.06, 0.095],
    );
  }
}
