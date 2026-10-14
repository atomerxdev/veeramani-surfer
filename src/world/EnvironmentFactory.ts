/**
 * Environment factory.
 *
 * Every piece of market geometry is built from a *shared* geometry and material
 * cache, so the whole world uses a handful of buffers no matter how long the run
 * lasts. Builders return plain `Group`s that callers pool and reuse.
 *
 * The look is intentionally chunky and readable: rounded-ish boxes, flat lambert
 * shading, strong silhouettes. Detailed art (GLB props, Tamil sign textures)
 * slots in later without changing any of this structure.
 */

import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { Palette, pickAwning, pickCloth, pickProduce, pickRoof, pickWall } from './Palette';

/* ------------------------------------------------------------ shared caches */

const geometryCache = new Map<string, BufferGeometry>();
const materialCache = new Map<string, MeshLambertMaterial>();

/** Get (or create) a shared box geometry. */
export function boxGeometry(width: number, height: number, depth: number): BufferGeometry {
  const key = `box:${width}:${height}:${depth}`;
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const geometry = new BoxGeometry(width, height, depth);
  geometryCache.set(key, geometry);
  return geometry;
}

export function sphereGeometry(radius: number, segments = 10): BufferGeometry {
  const key = `sphere:${radius}:${segments}`;
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const geometry = new SphereGeometry(radius, segments, Math.max(6, Math.round(segments * 0.7)));
  geometryCache.set(key, geometry);
  return geometry;
}

export function cylinderGeometry(radius: number, height: number, segments = 10): BufferGeometry {
  const key = `cyl:${radius}:${height}:${segments}`;
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const geometry = new CylinderGeometry(radius, radius, height, segments);
  geometryCache.set(key, geometry);
  return geometry;
}

export function coneGeometry(radius: number, height: number, segments = 10): BufferGeometry {
  const key = `cone:${radius}:${height}:${segments}`;
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const geometry = new ConeGeometry(radius, height, segments);
  geometryCache.set(key, geometry);
  return geometry;
}

export function circleGeometry(radius: number, segments = 16): BufferGeometry {
  const key = `circle:${radius}:${segments}`;
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const geometry = new CircleGeometry(radius, segments);
  geometryCache.set(key, geometry);
  return geometry;
}

/** Get (or create) a shared lambert material for a colour. */
export function material(color: number): MeshLambertMaterial {
  const key = `lambert:${color}`;
  const existing = materialCache.get(key);
  if (existing) {
    return existing;
  }
  const created = new MeshLambertMaterial({ color });
  materialCache.set(key, created);
  return created;
}

/** Add a mesh to a parent with position, shadow flags and optional rotation. */
export interface AddMeshOptions {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export function addMesh(
  parent: Group,
  geometry: BufferGeometry,
  color: number,
  options: AddMeshOptions = {},
): Mesh {
  const mesh = new Mesh(geometry, material(color));
  mesh.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
  mesh.rotation.set(options.rx ?? 0, options.ry ?? 0, options.rz ?? 0);
  mesh.castShadow = options.castShadow ?? false;
  mesh.receiveShadow = options.receiveShadow ?? false;
  parent.add(mesh);
  return mesh;
}

export function group(name: string): Group {
  const created = new Group();
  created.name = name;
  return created;
}

/** Free all cached world resources. Only used on a full app teardown. */
export function disposeWorldResources(): void {
  for (const geometry of geometryCache.values()) geometry.dispose();
  geometryCache.clear();
  for (const item of materialCache.values()) item.dispose();
  materialCache.clear();
  for (const basic of basicMaterialCache.values()) basic.dispose();
  basicMaterialCache.clear();
}

const basicMaterialCache = new Map<string, MeshBasicMaterial>();

/** Unlit material for flat details that should not react to lighting. */
export function flatMaterial(color: number, opacity = 1): MeshBasicMaterial {
  const key = `${color}:${opacity}`;
  const existing = basicMaterialCache.get(key);
  if (existing) return existing;
  const created = new MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    fog: true,
  });
  basicMaterialCache.set(key, created);
  return created;
}

/* ------------------------------------------------------------ track surfaces */

/** One segment worth of asphalt plus kerbs and lane markings. */
export function buildRoadChunk(length: number, halfWidth: number): Group {
  const road = group('road');
  addMesh(road, boxGeometry(halfWidth * 2, 0.3, length), Palette.asphalt, {
    y: -0.15,
    receiveShadow: true,
  });
  // Kerbs and pavements on both sides.
  for (const side of [-1, 1] as const) {
    addMesh(
      road,
      boxGeometry(1.1, 0.34, length),
      Palette.kerb,
      { x: side * (halfWidth + 0.55), y: -0.03, receiveShadow: true },
    );
    addMesh(
      road,
      boxGeometry(7, 0.3, length),
      Palette.pavement,
      { x: side * (halfWidth + 4.6), y: -0.05, receiveShadow: true },
    );
  }
  // Dashed lane dividers. The dash grid is derived from the segment length so
  // the pattern tiles exactly and no awkward gap appears at the segment seams.
  const desiredSpacing = 3.2;
  const dashCount = Math.max(1, Math.round(length / desiredSpacing));
  const spacing = length / dashCount;
  const dashLength = spacing * 0.5;
  for (let i = 0; i < dashCount; i += 1) {
    const z = -i * spacing - spacing / 2;
    for (const divider of [-1, 1] as const) {
      addMesh(road, boxGeometry(0.14, 0.04, dashLength), Palette.roadLine, {
        x: divider * 1.3,
        y: 0.004,
        z,
      });
    }
  }
  return road;
}

/* --------------------------------------------------------------- buildings */

/**
 * Build one building facade. `variant` picks the colour and silhouette so a
 * handful of pre-built variants give the street plenty of visual variety.
 */
/**
 * Build one building facade, centred on the origin with the shopfront facing
 * local -Z. The caller positions and rotates it (see MarketBuilder), so the same
 * mesh works for both sides of the street without duplicated geometry.
 */
export function buildBuilding(variant: number, seedIndex: number): Group {
  const building = group(`building-${variant}`);
  const height = 4.6 + (variant % 3) * 1.4;
  const width = 6.4;
  const depth = 5.2 + (variant % 2) * 1.2;
  const wall = pickWall(seedIndex + variant);
  const front = -depth / 2;

  addMesh(building, boxGeometry(width, height, depth), wall, {
    y: height / 2 - 0.05,
    receiveShadow: true,
  });
  // Roof slab + parapet.
  addMesh(building, boxGeometry(width + 0.5, 0.36, depth + 0.5), pickRoof(seedIndex + variant), {
    y: height + 0.13,
  });
  addMesh(building, boxGeometry(width + 0.2, 0.42, 0.36), Palette.wallTrim, {
    y: height + 0.44,
    z: front - 0.1,
  });
  // Rolled-down shop shutter at street level.
  addMesh(building, boxGeometry(width * 0.7, 2.2, 0.2), Palette.shutter, {
    y: 1.15,
    z: front - 0.08,
  });
  // Ribbon windows.
  const windowRows = Math.max(1, Math.round((height - 3.2) / 1.7));
  for (let row = 0; row < windowRows; row += 1) {
    const y = 3.1 + row * 1.7;
    if (y > height - 0.6) break;
    addMesh(building, boxGeometry(width * 0.26, 0.95, 0.16), Palette.window, {
      x: -width * 0.2,
      y,
      z: front - 0.06,
    });
    addMesh(building, boxGeometry(width * 0.26, 0.95, 0.16), Palette.window, {
      x: width * 0.2,
      y,
      z: front - 0.06,
    });
    addMesh(building, boxGeometry(width * 0.6, 0.14, 0.22), Palette.wallTrim, {
      y: y - 0.58,
      z: front - 0.07,
    });
  }
  // Painted shop sign above the shutter (Tamil lettering is textured in later).
  addMesh(building, boxGeometry(width * 0.62, 0.62, 0.14), pickAwning(seedIndex + variant), {
    y: 2.72,
    z: front - 0.1,
  });
  // An awning over the shopfront.
  addMesh(building, boxGeometry(width * 0.74, 0.1, 1.5), pickAwning(seedIndex + variant + 2), {
    y: 3.3,
    z: front - 0.7,
    rx: -0.16,
  });
  // A balcony on some facades.
  if (varies(seedIndex + variant, 3) === 0) {
    addMesh(building, boxGeometry(width * 0.5, 0.16, 1.0), Palette.wallTrim, {
      y: 4.6,
      z: front - 0.5,
    });
    addMesh(building, boxGeometry(width * 0.5, 0.6, 0.1), Palette.metalDark, {
      y: 4.95,
      z: front - 0.95,
    });
  }
  return building;
}

/** Cheap deterministic pseudo-random helper for geometry variation. */
function varies(seed: number, modulo: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.floor((value - Math.floor(value)) * modulo);
}

/** Painted sign board. Textures with Tamil lettering are added in a later pass. */
export function buildSignBoard(variant: number, width = 2.6, height = 0.7): Group {
  const board = group('sign');
  addMesh(board, boxGeometry(width, height, 0.12), pickAwning(variant), { y: 0 });
  addMesh(board, boxGeometry(width * 0.9, height * 0.28, 0.14), Palette.wallTrim, {
    y: height * 0.16,
  });
  addMesh(board, boxGeometry(width * 0.8, height * 0.2, 0.14), Palette.wallTrim, {
    y: -height * 0.16,
  });
  return board;
}

/* ------------------------------------------------------------------- props */

export function buildAwning(variant: number, width: number, depth: number): Group {
  const awning = group('awning');
  const color = pickAwning(variant);
  addMesh(awning, boxGeometry(width, 0.12, depth), color, { y: 0, rx: -0.14 });
  addMesh(awning, boxGeometry(width, 0.5, 0.14), color, { y: -0.3, z: -depth / 2, rz: 0 });
  for (const side of [-1, 1] as const) {
    addMesh(awning, cylinderGeometry(0.05, 1.9), Palette.metalDark, {
      x: side * (width / 2 - 0.15),
      y: -0.9,
      z: depth / 3,
    });
  }
  return awning;
}

export function buildWires(): Group {
  const wires = group('wires');
  addMesh(wires, boxGeometry(11.5, 0.06, 0.06), Palette.metalDark, { y: 0, z: 0 });
  addMesh(wires, boxGeometry(11.5, 0.05, 0.05), Palette.metalDark, { y: -0.5, z: 0.6, rx: 0.03 });
  for (let i = 0; i < 5; i += 1) {
    addMesh(wires, coneGeometry(0.16, 0.34), pickCloth(i), {
      x: -4 + i * 2,
      y: -0.35,
      z: 0.3,
      rz: Math.PI,
    });
  }
  return wires;
}

/**
 * A vendor stall. Centred on the origin with the counter facing local -Z, so the
 * caller can place and rotate it on either pavement.
 */
export function buildStall(variant: number): Group {
  const stall = group('stall');
  const baseX = 0;
  // Counter.
  addMesh(stall, boxGeometry(3.2, 1.0, 1.4), Palette.wood, {
    x: baseX,
    y: 0.5,
    receiveShadow: true,
  });
  // Tarp roof.
  addMesh(stall, boxGeometry(3.8, 0.14, 2.2), pickAwning(variant), { x: baseX, y: 2.4, rx: -0.1 });
  for (const legX of [-1.5, 1.5] as const) {
    addMesh(stall, cylinderGeometry(0.06, 1.9), Palette.metalDark, {
      x: baseX + legX,
      y: 1.4,
      z: -0.7,
    });
    addMesh(stall, cylinderGeometry(0.06, 1.9), Palette.metalDark, {
      x: baseX + legX,
      y: 1.4,
      z: 0.7,
    });
  }
  // Produce baskets.
  for (let i = 0; i < 3; i += 1) {
    const bx = baseX - 1 + i;
    addMesh(stall, cylinderGeometry(0.4, 0.28), Palette.crateDark, { x: bx, y: 1.13, z: 0 });
    for (let j = 0; j < 3; j += 1) {
      addMesh(stall, sphereGeometry(0.13, 8), pickProduce(variant + i + j), {
        x: bx + (j - 1) * 0.16,
        y: 1.3,
        z: (j % 2 === 0 ? 0.14 : -0.14),
      });
    }
  }
  // Hanging garland.
  addMesh(stall, boxGeometry(2.6, 0.08, 0.08), Palette.woodDark, { x: baseX, y: 1.95, z: -0.8 });
  for (let i = 0; i < 6; i += 1) {
    addMesh(stall, sphereGeometry(0.1, 8), pickCloth(i), {
      x: baseX - 1.1 + i * 0.44,
      y: 1.78,
      z: -0.8,
    });
  }
  return stall;
}

export function buildParkedScooter(variant: number): Group {
  const scooter = group('scooter');
  const color = pickAwning(variant);
  addMesh(scooter, boxGeometry(0.5, 0.5, 1.5), color, { y: 0.62 });
  addMesh(scooter, boxGeometry(0.44, 0.36, 0.6), color, { y: 0.95, z: 0.42 });
  addMesh(scooter, boxGeometry(0.5, 0.5, 0.42), Palette.metalDark, { y: 0.72, z: -0.72 });
  addMesh(scooter, cylinderGeometry(0.1, 0.9), Palette.metal, { y: 1.05, z: -0.7, rz: 0.5 });
  addMesh(scooter, cylinderGeometry(0.3, 0.16), Palette.tyre, { y: 0.3, z: -0.75, rz: Math.PI / 2 });
  addMesh(scooter, cylinderGeometry(0.3, 0.16), Palette.tyre, { y: 0.3, z: 0.75, rz: Math.PI / 2 });
  return scooter;
}

export function buildBicycle(variant: number): Group {
  const bicycle = group('bicycle');
  const color = pickAwning(variant + 2);
  addMesh(bicycle, cylinderGeometry(0.34, 0.06), Palette.tyre, { y: 0.34, z: -0.55, rz: Math.PI / 2 });
  addMesh(bicycle, cylinderGeometry(0.34, 0.06), Palette.tyre, { y: 0.34, z: 0.55, rz: Math.PI / 2 });
  addMesh(bicycle, boxGeometry(0.08, 0.08, 1.1), color, { y: 0.62 });
  addMesh(bicycle, boxGeometry(0.08, 0.5, 0.08), color, { y: 0.62, z: 0.5, rx: 0.4 });
  addMesh(bicycle, boxGeometry(0.5, 0.05, 0.05), Palette.metalDark, { y: 0.95, z: -0.5 });
  addMesh(bicycle, boxGeometry(0.12, 0.22, 0.3), Palette.woodDark, { y: 0.78, z: 0.3 });
  return bicycle;
}

export function buildHandcart(variant: number): Group {
  const cart = group('handcart');
  const wood = Palette.wood;
  addMesh(cart, boxGeometry(2.0, 0.16, 1.1), wood, { y: 0.72, receiveShadow: true });
  for (const side of [-1, 1] as const) {
    addMesh(cart, boxGeometry(0.12, 0.5, 1.1), Palette.crateDark, { x: side * 0.95, y: 1.02 });
  }
  addMesh(cart, boxGeometry(2.0, 0.5, 0.12), Palette.crateDark, { y: 1.02, z: 0.55 });
  // Load.
  addMesh(cart, boxGeometry(1.4, 0.6, 0.8), Palette.crate, { y: 1.1, z: -0.05 });
  for (let i = 0; i < 4; i += 1) {
    addMesh(cart, sphereGeometry(0.16, 8), pickProduce(variant + i), {
      x: -0.5 + i * 0.33,
      y: 1.5,
      z: 0,
    });
  }
  // Wheels + handles.
  addMesh(cart, cylinderGeometry(0.42, 0.18), Palette.tyre, { y: 0.42, z: -0.3, rz: Math.PI / 2 });
  addMesh(cart, boxGeometry(0.1, 0.1, 1.3), Palette.metalDark, { x: 0.9, y: 1.0, z: 1.05, rx: -0.25 });
  addMesh(cart, boxGeometry(0.1, 0.1, 1.3), Palette.metalDark, { x: -0.9, y: 1.0, z: 1.05, rx: -0.25 });
  addMesh(cart, boxGeometry(1.9, 0.1, 0.1), Palette.metalDark, { y: 1.22, z: 1.6 });
  return cart;
}

/**
 * Stacked produce crates. Deliberately tall (~1.9 m) so this reads as a true
 * lane blocker: jumping over it is not a realistic option, changing lane is.
 */
export function buildCrateStack(variant: number): Group {
  const stack = group('crate-stack');
  addMesh(stack, boxGeometry(1.8, 0.5, 1.4), Palette.crate, { y: 0.25, receiveShadow: true });
  addMesh(stack, boxGeometry(1.7, 0.5, 1.35), Palette.crateDark, { y: 0.75, x: 0.04 });
  addMesh(stack, boxGeometry(1.6, 0.48, 1.3), Palette.crate, { y: 1.23, x: -0.05 });
  addMesh(stack, boxGeometry(1.4, 0.42, 1.15), Palette.crateDark, { y: 1.68, x: 0.03 });
  addMesh(stack, boxGeometry(1.85, 0.08, 1.45), Palette.crateDark, { y: 1.9, x: 0 });
  if (variant % 2 === 0) {
    addMesh(stack, sphereGeometry(0.18, 8), pickProduce(variant), { y: 2.05, x: -0.4 });
    addMesh(stack, sphereGeometry(0.16, 8), pickProduce(variant + 1), { y: 2.03, x: 0.05 });
  }
  return stack;
}

export function buildParcelPile(variant: number): Group {
  const pile = group('parcel-pile');
  const cardboard = 0xc9a26b + ((variant % 3) * 0x0a0a0a);
  addMesh(pile, boxGeometry(1.4, 0.8, 1.0), cardboard, { y: 0.4, receiveShadow: true });
  addMesh(pile, boxGeometry(1.5, 0.1, 0.9), pickAwning(variant + 4), { y: 0.62, z: 0.05 });
  addMesh(pile, boxGeometry(0.8, 0.44, 0.7), 0xd9b382, { y: 1.02, x: 0.2 });
  addMesh(pile, boxGeometry(0.82, 0.12, 0.72), Palette.wallTrim, { y: 1.18, x: 0.2 });
  addMesh(pile, boxGeometry(0.5, 0.34, 0.5), cardboard, { y: 1.4, x: 0.25, rz: 0.15 });
  return pile;
}

export function buildLowBarrier(variant: number): Group {
  const barrier = group('low-barrier');
  const color = pickAwning(variant + 3);
  // Painted wooden bar over trestles - clearly jumpable.
  addMesh(barrier, boxGeometry(2.4, 0.28, 0.2), color, { y: 0.46 });
  addMesh(barrier, boxGeometry(2.4, 0.12, 0.16), Palette.wallTrim, { y: 0.24 });
  for (const side of [-1, 1] as const) {
    addMesh(barrier, boxGeometry(0.14, 0.6, 0.5), Palette.woodDark, { x: side * 1.0, y: 0.3 });
  }
  return barrier;
}

/**
 * Festival banner strung across a lane from 1.05 m to 1.95 m. The player must
 * slide under it; the matching hitbox lives in HazardCatalog.
 *
 * The group origin sits at banner height, so position it at y = 1.5.
 */
export function buildOverheadBarrier(variant: number): Group {
  const barrier = group('overhead-barrier');
  const color = pickAwning(variant + 1);
  addMesh(barrier, boxGeometry(2.5, 0.9, 0.16), color, { y: 0 });
  addMesh(barrier, boxGeometry(2.5, 0.14, 0.22), Palette.wallTrim, { y: 0.34 });
  addMesh(barrier, boxGeometry(2.5, 0.14, 0.22), Palette.wallTrim, { y: -0.34 });
  addMesh(barrier, boxGeometry(0.16, 1.5, 0.16), Palette.woodDark, { x: 1.15, y: -0.75 });
  addMesh(barrier, boxGeometry(0.16, 1.5, 0.16), Palette.woodDark, { x: -1.15, y: -0.75 });
  for (let i = 0; i < 6; i += 1) {
    addMesh(barrier, coneGeometry(0.12, 0.28), pickCloth(i), {
      x: -1 + i * 0.4,
      y: -0.55,
      rz: Math.PI,
    });
  }
  return barrier;
}

/** Flat token: a brass disc with a raised rim, faces the camera. */
export function buildTokenGeometry(): BufferGeometry {
  const key = 'token-disc';
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const geometry = new CylinderGeometry(0.32, 0.32, 0.07, 14);
  geometry.rotateX(Math.PI / 2);
  geometryCache.set(key, geometry);
  return geometry;
}

export function buildTokenRingGeometry(): BufferGeometry {
  const key = 'token-ring';
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const geometry = new CylinderGeometry(0.34, 0.34, 0.03, 14);
  geometry.rotateX(Math.PI / 2);
  geometryCache.set(key, geometry);
  return geometry;
}

export function buildPowerUpGeometry(kind: 'shield' | 'magnet' | 'multiplier' | 'boost'): BufferGeometry {
  const key = `powerup:${kind}`;
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const geometry =
    kind === 'shield'
      ? new SphereGeometry(0.4, 12, 10)
      : kind === 'magnet'
        ? new TorusGeometry(0.24, 0.08, 16, 24, Math.PI)
        : kind === 'multiplier'
          ? new CylinderGeometry(0.36, 0.36, 0.46, 6)
          : new ConeGeometry(0.36, 0.6, 10);
  geometryCache.set(key, geometry);
  return geometry;
}

/** A plain contact shadow disc so props read well even without shadow maps. */
export function buildContactShadow(radius: number): Mesh {
  const mesh = new Mesh(circleGeometry(radius, 14), flatMaterial(0x000000, 0.14));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  return mesh;
}
