/**
 * GLB/GLTF Character Rig.
 *
 * Implements `CharacterRig` using a skinned GLTF/GLB model with Three.js AnimationMixer.
 * Allows dropping in any rigged 3D human character (e.g. from Blender, Mixamo, or custom sculpt)
 * with automatic clip mapping for:
 * - idle
 * - running (or run)
 * - jumping (or jump)
 * - sliding (or slide)
 * - stumble (or hit)
 * - gameover (or fall / defeat)
 */

import {
  AnimationAction,
  AnimationMixer,
  Box3,
  Group,
  LoopOnce,
  LoopRepeat,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterRig, MotionState, RigAnimationContext } from './CharacterRig';

export interface GlbCharacterOptions {
  readonly url: string;
  readonly targetHeight?: number;
  readonly onLoaded?: () => void;
  readonly onError?: (error: unknown) => void;
}

export class GlbCharacter implements CharacterRig {
  readonly root = new Group();
  height = 1.78;

  private mixer: AnimationMixer | null = null;
  private readonly actions = new Map<MotionState, AnimationAction>();
  private currentAction: AnimationAction | null = null;
  private currentMotion: MotionState = 'idle';
  private loaded = false;

  constructor(options: GlbCharacterOptions) {
    this.root.name = 'glb-character';
    const loader = new GLTFLoader();

    loader.load(
      options.url,
      (gltf) => {
        const model = gltf.scene;
        model.name = 'glb-model';

        // Compute model bounding box to scale to target height (default 1.78m)
        const box = new Box3().setFromObject(model);
        const size = new Vector3();
        box.getSize(size);
        const modelHeight = size.y || 1;
        const targetHeight = options.targetHeight ?? 1.78;
        const scale = targetHeight / modelHeight;
        model.scale.setScalar(scale);

        // Enable shadow casting on all meshes
        model.traverse((child) => {
          if ('isMesh' in child && child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        this.root.add(model);
        this.height = targetHeight;

        // Setup AnimationMixer
        if (gltf.animations.length > 0) {
          const mixer = new AnimationMixer(model);
          this.mixer = mixer;

          const clipMap: Record<MotionState, string[]> = {
            idle: ['idle', 'stand', 'breathe'],
            running: ['run', 'running', 'sprint', 'jog'],
            jumping: ['jump', 'jumping', 'leap'],
            sliding: ['slide', 'sliding', 'crouch'],
            stumble: ['stumble', 'hit', 'hurt', 'impact'],
            gameover: ['gameover', 'death', 'die', 'fall', 'defeat'],
          };

          for (const [state, keywords] of Object.entries(clipMap) as [MotionState, string[]][]) {
            const clip = gltf.animations.find((c) =>
              keywords.some((kw) => c.name.toLowerCase().includes(kw)),
            );
            if (clip) {
              const action = mixer.clipAction(clip);
              if (state === 'stumble' || state === 'gameover') {
                action.setLoop(LoopOnce, 1);
                action.clampWhenFinished = true;
              } else {
                action.setLoop(LoopRepeat, Infinity);
              }
              this.actions.set(state, action);
            }
          }

          // Start default idle or running animation
          const initialAction = this.actions.get('running') ?? this.actions.get('idle');
          if (initialAction) {
            initialAction.play();
            this.currentAction = initialAction;
          }
        }

        this.loaded = true;
        options.onLoaded?.();
      },
      undefined,
      (err) => {
        options.onError?.(err);
      },
    );
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  update(dt: number, context: RigAnimationContext): void {
    if (!this.mixer) return;

    // Cross-fade animation clip if motion state changed
    if (context.motion !== this.currentMotion) {
      const nextAction = this.actions.get(context.motion);
      if (nextAction && nextAction !== this.currentAction) {
        if (this.currentAction) {
          this.currentAction.fadeOut(0.18);
        }
        nextAction.reset().fadeIn(0.18).play();
        this.currentAction = nextAction;
      }
      this.currentMotion = context.motion;
    }

    // Adjust run playback speed with player speed
    if (this.currentMotion === 'running' && this.currentAction) {
      const playbackRate = 0.8 + 1.2 * context.speedRatio;
      this.currentAction.timeScale = playbackRate;
    }

    this.mixer.update(dt);
  }

  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.root.clear();
  }
}
