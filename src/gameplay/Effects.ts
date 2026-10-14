/**
 * Pooled gameplay feedback effects.
 *
 * A small fixed pool of expanding rings used for pickups, shield absorbs and
 * crashes. Fixed size + reuse means no allocation in the render loop and no way
 * for effects to pile up if the player spams inputs.
 */

import { Group, Mesh, MeshBasicMaterial, TorusGeometry } from 'three';

interface EffectInstance {
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;
  life: number;
  maxLife: number;
  fromScale: number;
  toScale: number;
  active: boolean;
}

const RING_GEOMETRY = new TorusGeometry(0.3, 0.045, 6, 18);

export class EffectsPool {
  private readonly instances: EffectInstance[] = [];

  constructor(
    private readonly root: Group,
    private readonly limit = 14,
  ) {
    for (let i = 0; i < this.limit; i += 1) {
      const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const mesh = new Mesh(RING_GEOMETRY, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, -100, 0);
      mesh.visible = false;
      this.root.add(mesh);
      this.instances.push({
        mesh,
        material,
        life: 0,
        maxLife: 0.3,
        fromScale: 0.4,
        toScale: 1.4,
        active: false,
      });
    }
  }

  /** Fire a ring at a world position. Silently ignored when the pool is busy. */
  pop(x: number, y: number, z: number, color: number, radius = 0.9, duration = 0.32): void {
    const instance = this.instances.find((item) => !item.active);
    if (!instance) return;
    instance.active = true;
    instance.life = duration;
    instance.maxLife = duration;
    instance.fromScale = 0.35;
    instance.toScale = radius / 0.3;
    instance.material.color.setHex(color);
    instance.material.opacity = 0.85;
    instance.mesh.position.set(x, y, z);
    instance.mesh.scale.setScalar(instance.fromScale);
    instance.mesh.visible = true;
  }

  update(dt: number): void {
    for (const instance of this.instances) {
      if (!instance.active) continue;
      instance.life -= dt;
      if (instance.life <= 0) {
        instance.active = false;
        instance.mesh.visible = false;
        instance.mesh.position.y = -100;
        continue;
      }
      const t = 1 - instance.life / instance.maxLife;
      const scale = instance.fromScale + (instance.toScale - instance.fromScale) * t;
      instance.mesh.scale.setScalar(scale);
      instance.material.opacity = 0.85 * (1 - t);
    }
  }

  reset(): void {
    for (const instance of this.instances) {
      instance.active = false;
      instance.life = 0;
      instance.material.opacity = 0;
      instance.mesh.visible = false;
      instance.mesh.position.y = -100;
    }
  }

  dispose(): void {
    this.reset();
    for (const instance of this.instances) {
      this.root.remove(instance.mesh);
      instance.material.dispose();
    }
    this.instances.length = 0;
  }
}
