/**
 * Collision detection.
 *
 * Deliberately simple and predictable: every hazard and the player are
 * axis-aligned boxes (AABB) stored as data, completely separate from the render
 * meshes. Hitboxes therefore never depend on detailed geometry, stay cheap, and
 * can be unit tested without a renderer.
 */

export interface Collider {
  /** World-space centre of the box. */
  centerX: number;
  centerY: number;
  centerZ: number;
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
}

/** Axis-aligned box overlap on all three axes. Touching faces do not count. */
export function boxesOverlap(a: Collider, b: Collider): boolean {
  return (
    Math.abs(a.centerX - b.centerX) < a.halfWidth + b.halfWidth &&
    Math.abs(a.centerY - b.centerY) < a.halfHeight + b.halfHeight &&
    Math.abs(a.centerZ - b.centerZ) < a.halfDepth + b.halfDepth
  );
}

/** Squared distance between two centres, used for magnet/token pickups. */
export function centreDistanceSquared(a: Collider, b: Collider): number {
  const dx = a.centerX - b.centerX;
  const dy = a.centerY - b.centerY;
  const dz = a.centerZ - b.centerZ;
  return dx * dx + dy * dy + dz * dz;
}

/** Overlap test on X and Z only (used to give tokens a forgiving radius). */
export function overlapsGroundPlane(a: Collider, b: Collider, slack: number): boolean {
  return (
    Math.abs(a.centerX - b.centerX) < a.halfWidth + b.halfWidth + slack &&
    Math.abs(a.centerZ - b.centerZ) < a.halfDepth + b.halfDepth + slack
  );
}

/**
 * Widen a collider for a reward pickup so grabbing a token feels generous
 * without making hazards feel unfair.
 */
export function inflate(collider: Collider, amount: number): Collider {
  return {
    ...collider,
    halfWidth: collider.halfWidth + amount,
    halfHeight: collider.halfHeight + amount,
    halfDepth: collider.halfDepth + amount,
  };
}
