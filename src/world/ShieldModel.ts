/**
 * 3D Shield Model.
 *
 * A high-fidelity, polished 3D Shield power-up model:
 * - Sculpted heraldic crest / heater shield silhouette with convex curvature
 * - Polished chrome steel reinforced outer rim with golden corner rivets
 * - Rich metallic sapphire/azure inner shield plate
 * - Raised 4-point golden star emblem with a glowing blue energy crystal core
 * - Dual orbiting protective forcefield energy rings
 * - Soft radiant atmospheric halo and ground contact shadow
 * - Also provides `buildActiveShieldBubble()` for the player's active protective barrier!
 */

import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { circleGeometry, flatMaterial } from './EnvironmentFactory';

/**
 * Creates the 2D crest / heater shield profile shape.
 */
function createShieldShape(scale = 1.0): Shape {
  const shape = new Shape();
  const w = 0.24 * scale;
  const hTop = 0.30 * scale;
  const hMid = 0.06 * scale;
  const hBottom = -0.32 * scale;

  shape.moveTo(0, hTop);
  // Top-right curve
  shape.quadraticCurveTo(w * 0.65, hTop + 0.02 * scale, w, hTop - 0.04 * scale);
  // Right side down to mid-flank
  shape.lineTo(w, hMid);
  // Right lower taper to bottom point
  shape.quadraticCurveTo(w * 0.75, hBottom * 0.45, 0, hBottom);
  // Left lower taper from bottom point
  shape.quadraticCurveTo(-w * 0.75, hBottom * 0.45, -w, hMid);
  // Left side up to top-left
  shape.lineTo(-w, hTop - 0.04 * scale);
  // Top-left curve back to top center
  shape.quadraticCurveTo(-w * 0.65, hTop + 0.02 * scale, 0, hTop);

  return shape;
}

/**
 * Builds the floating 3D Shield pickup on the track.
 */
export function buildShield3DModel(): Group {
  const root = new Group();
  root.name = 'powerup-shield';

  const shieldBody = new Group();
  shieldBody.name = 'shield-body';
  // Slight forward tilt for dynamic presentation
  shieldBody.rotation.x = 0.18;
  root.add(shieldBody);

  // 1. High-Fidelity PBR Materials
  // Polished chrome steel for the heavy reinforced outer rim
  const chromeRimMat = new MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.16,
    metalness: 0.95,
  });

  // Deep metallic sapphire/azure inner shield plate
  const innerPlateMat = new MeshStandardMaterial({
    color: 0x0284c7,
    emissive: 0x0369a1,
    emissiveIntensity: 0.35,
    roughness: 0.24,
    metalness: 0.78,
  });

  // Gold emblem & rim rivets
  const goldEmblemMat = new MeshStandardMaterial({
    color: 0xf5b52e,
    roughness: 0.22,
    metalness: 0.92,
  });

  // Glowing cyan/blue energy crystal core
  const energyCoreMat = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 2.8,
    roughness: 0.1,
    metalness: 0.15,
  });

  // Orbiting forcefield energy rings
  const forcefieldRingMat = new MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x38bdf8,
    emissiveIntensity: 2.2,
    transparent: true,
    opacity: 0.85,
    roughness: 0.1,
  });

  // 2. Heavy Chrome Outer Frame (Extruded with bevel)
  const outerShape = createShieldShape(1.0);
  const outerGeo = new ExtrudeGeometry(outerShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  outerGeo.center();
  const outerMesh = new Mesh(outerGeo, chromeRimMat);
  outerMesh.castShadow = true;
  outerMesh.receiveShadow = true;
  shieldBody.add(outerMesh);

  // 3. Inset Azure Inner Plate
  const innerShape = createShieldShape(0.84);
  const innerGeo = new ExtrudeGeometry(innerShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.015,
    bevelThickness: 0.015,
  });
  innerGeo.center();
  const innerMesh = new Mesh(innerGeo, innerPlateMat);
  innerMesh.position.z = 0.018;
  shieldBody.add(innerMesh);

  // 4. Golden Rivets along the Rim
  const rivetGeo = new CylinderGeometry(0.014, 0.014, 0.018, 10);
  const rivetPositions: [number, number, number][] = [
    [0, 0.28, 0.042],
    [-0.18, 0.22, 0.042],
    [0.18, 0.22, 0.042],
    [-0.20, 0.04, 0.042],
    [0.20, 0.04, 0.042],
    [-0.10, -0.16, 0.042],
    [0.10, -0.16, 0.042],
    [0, -0.26, 0.042],
  ];
  for (const pos of rivetPositions) {
    const rivet = new Mesh(rivetGeo, goldEmblemMat);
    rivet.position.set(...pos);
    rivet.rotation.x = Math.PI / 2;
    rivet.castShadow = true;
    shieldBody.add(rivet);
  }

  // 5. Center Raised 4-Point Golden Star Emblem
  const starGroup = new Group();
  starGroup.position.set(0, 0.04, 0.045);
  shieldBody.add(starGroup);

  // Vertical & horizontal diamond points
  const diamondGeoV = new CylinderGeometry(0.025, 0.005, 0.20, 4);
  const diamondV = new Mesh(diamondGeoV, goldEmblemMat);
  diamondV.rotation.y = Math.PI / 4;
  starGroup.add(diamondV);

  const diamondGeoH = new CylinderGeometry(0.025, 0.005, 0.16, 4);
  const diamondH = new Mesh(diamondGeoH, goldEmblemMat);
  diamondH.rotation.z = Math.PI / 2;
  diamondH.rotation.x = Math.PI / 4;
  starGroup.add(diamondH);

  // Glowing Blue Energy Crystal Core at the center of the emblem
  const coreGeo = new SphereGeometry(0.042, 16, 12);
  const coreMesh = new Mesh(coreGeo, energyCoreMat);
  coreMesh.position.set(0, 0, 0.015);
  starGroup.add(coreMesh);

  // 6. Dual Orbiting Protective Forcefield Rings
  const orbit1Geo = new TorusGeometry(0.38, 0.014, 8, 28);
  const orbit1 = new Mesh(orbit1Geo, forcefieldRingMat);
  orbit1.rotation.set(0.4, 0.3, 0.2);
  shieldBody.add(orbit1);

  const orbit2Geo = new TorusGeometry(0.42, 0.010, 8, 28);
  const orbit2 = new Mesh(orbit2Geo, forcefieldRingMat);
  orbit2.rotation.set(-0.35, -0.4, -0.25);
  shieldBody.add(orbit2);

  // 7. Radiant Translucent Energy Halo
  const haloGeo = new SphereGeometry(0.48, 16, 12);
  const haloMat = new MeshBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.20,
  });
  const halo = new Mesh(haloGeo, haloMat);
  halo.scale.set(1.15, 1.3, 0.9);
  shieldBody.add(halo);

  // 8. Road Contact Shadow
  const shadow = new Mesh(circleGeometry(0.42, 16), flatMaterial(0x000000, 0.22));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.98;
  root.add(shadow as unknown as Object3D);

  return root;
}

/**
 * Builds the player's active protective forcefield bubble:
 * Appears around Veeramani when the shield power-up is active!
 */
export function buildActiveShieldBubble(): Group {
  const root = new Group();
  root.name = 'player-shield-bubble';

  // Translucent glowing forcefield sphere
  const bubbleGeo = new SphereGeometry(1.08, 24, 18);
  const bubbleMat = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.85,
    transparent: true,
    opacity: 0.24,
    roughness: 0.15,
    metalness: 0.1,
    depthWrite: false,
  });
  const bubble = new Mesh(bubbleGeo, bubbleMat);
  root.add(bubble);

  // Glowing equatorial & meridian forcefield rings
  const ringMat = new MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x38bdf8,
    emissiveIntensity: 2.2,
    transparent: true,
    opacity: 0.8,
    roughness: 0.1,
  });

  const eqRing = new Mesh(new TorusGeometry(1.09, 0.015, 8, 32), ringMat);
  eqRing.rotation.x = Math.PI / 2;
  root.add(eqRing);

  const meridianRing = new Mesh(new TorusGeometry(1.09, 0.012, 8, 32), ringMat);
  meridianRing.rotation.y = Math.PI / 2;
  root.add(meridianRing);

  // Hidden by default; activated when isShieldActive is true
  root.visible = false;
  return root;
}
