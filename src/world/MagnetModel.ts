/**
 * 3D Magnet Model.
 *
 * A high-fidelity, polished 3D Horseshoe Magnet power-up model:
 * - Classic iconic U-shape curved arch with smooth tubular beveling
 * - Deep high-gloss red enamel coat (MeshStandardMaterial)
 * - Polished silver chrome magnetic pole tips (North and South)
 * - Gold divide accent rings separating enamel and chrome
 * - Blue (N) and Red (S) magnetic pole indicators
 * - Glowing electric-blue magnetic flux energy arc connecting the poles
 * - Soft ambient energy halo and ground contact shadow
 */

import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { circleGeometry, flatMaterial } from './EnvironmentFactory';

export function buildMagnet3DModel(): Group {
  const root = new Group();
  root.name = 'powerup-magnet';

  // Floating tilted body container
  const magnetBody = new Group();
  magnetBody.name = 'magnet-body';
  // Slight forward tilt so the horseshoe shape and pole gap are prominently visible
  magnetBody.rotation.x = 0.22;
  root.add(magnetBody);

  // 1. High-fidelity PBR Materials
  // Deep gloss red enamel for the horseshoe curve
  const redEnamelMat = new MeshStandardMaterial({
    color: 0xdb232a,
    roughness: 0.26,
    metalness: 0.35,
  });

  // Polished chrome for the magnetic pole tips
  const chromeMat = new MeshStandardMaterial({
    color: 0xf0f4f8,
    roughness: 0.14,
    metalness: 0.95,
  });

  // Gold accent divide rings
  const goldRingMat = new MeshStandardMaterial({
    color: 0xf5b52e,
    roughness: 0.22,
    metalness: 0.88,
  });

  // Pole indicator badges (North = Blue, South = Red)
  const northBadgeMat = new MeshStandardMaterial({
    color: 0x1d4ed8,
    emissive: 0x1e40af,
    emissiveIntensity: 0.4,
    roughness: 0.3,
    metalness: 0.6,
  });
  const southBadgeMat = new MeshStandardMaterial({
    color: 0xb91c1c,
    emissive: 0x991b1b,
    emissiveIntensity: 0.4,
    roughness: 0.3,
    metalness: 0.6,
  });

  // Glowing electric magnetic flux arc bridging the poles
  const fluxArcMat = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 2.4,
    transparent: true,
    opacity: 0.92,
    roughness: 0.1,
    metalness: 0.1,
  });

  // Soft electric energy sparkle
  const energyPulseMat = new MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x38bdf8,
    emissiveIntensity: 2.0,
    transparent: true,
    opacity: 0.75,
  });

  // 2. Geometry: Top Horseshoe Arch
  // Torus half-circle arch (radius = 0.22, tube = 0.078)
  const archGeo = new TorusGeometry(0.22, 0.078, 16, 24, Math.PI);
  const archMesh = new Mesh(archGeo, redEnamelMat);
  archMesh.position.set(0, 0.12, 0);
  archMesh.rotation.z = Math.PI; // Curved crown at the top
  archMesh.castShadow = true;
  archMesh.receiveShadow = true;
  magnetBody.add(archMesh);

  // 3. Parallel Cylindrical Prongs (Legs)
  const prongGeo = new CylinderGeometry(0.078, 0.078, 0.24, 18);
  for (const side of [-1, 1] as const) {
    const prong = new Mesh(prongGeo, redEnamelMat);
    prong.position.set(side * 0.22, 0.0, 0);
    prong.castShadow = true;
    prong.receiveShadow = true;
    magnetBody.add(prong);

    // Gold divide trim ring
    const goldRingGeo = new TorusGeometry(0.082, 0.012, 8, 18);
    const goldRing = new Mesh(goldRingGeo, goldRingMat);
    goldRing.position.set(side * 0.22, -0.12, 0);
    goldRing.rotation.x = Math.PI / 2;
    goldRing.castShadow = true;
    magnetBody.add(goldRing);

    // Chrome Magnetic Pole Tip
    const tipGeo = new CylinderGeometry(0.079, 0.079, 0.13, 18);
    const tipMesh = new Mesh(tipGeo, chromeMat);
    tipMesh.position.set(side * 0.22, -0.19, 0);
    tipMesh.castShadow = true;
    tipMesh.receiveShadow = true;
    magnetBody.add(tipMesh);

    // Rounded pole end cap
    const capGeo = new SphereGeometry(0.078, 14, 8);
    const capMesh = new Mesh(capGeo, chromeMat);
    capMesh.position.set(side * 0.22, -0.255, 0);
    capMesh.scale.set(1.0, 0.25, 1.0);
    magnetBody.add(capMesh);

    // North (left) and South (right) indicator bands
    const badgeGeo = new CylinderGeometry(0.082, 0.082, 0.035, 18);
    const badgeMat = side === -1 ? northBadgeMat : southBadgeMat;
    const badgeMesh = new Mesh(badgeGeo, badgeMat);
    badgeMesh.position.set(side * 0.22, -0.20, 0);
    magnetBody.add(badgeMesh);
  }

  // 4. Electric Magnetic Flux Arc (Arches between North and South poles)
  // An energetic glowing bridge representing the magnetic attraction force
  const fluxGeo = new TorusGeometry(0.18, 0.016, 8, 20, Math.PI);
  const fluxMesh = new Mesh(fluxGeo, fluxArcMat);
  fluxMesh.position.set(0, -0.25, 0);
  fluxMesh.rotation.z = 0; // Curved upwards bridging the gap
  magnetBody.add(fluxMesh);

  // Concentric magnetic field wave pulse
  const fieldRingGeo = new TorusGeometry(0.10, 0.01, 8, 16);
  const fieldRing = new Mesh(fieldRingGeo, energyPulseMat);
  fieldRing.position.set(0, -0.24, 0);
  fieldRing.rotation.x = Math.PI / 2;
  magnetBody.add(fieldRing);

  // 5. Translucent Radiant Magnetic Halo
  const haloGeo = new SphereGeometry(0.48, 16, 12);
  const haloMat = new MeshBasicMaterial({
    color: 0xff3366,
    transparent: true,
    opacity: 0.18,
  });
  const halo = new Mesh(haloGeo, haloMat);
  halo.scale.set(1.2, 1.25, 1.0);
  magnetBody.add(halo);

  // 6. Contact shadow underneath
  const shadow = new Mesh(circleGeometry(0.44, 16), flatMaterial(0x000000, 0.22));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.98;
  root.add(shadow as unknown as Object3D);

  return root;
}
