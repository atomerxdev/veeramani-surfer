/**
 * Veeramani Character Textures.
 *
 * Generates custom high-resolution PBR textures for Veeramani's face,
 * clothing, and accessories based on the reference photographs of the
 * famous Tamil vlogger Veeramani.
 *
 * Designed to work seamlessly in both browser (CanvasTexture) and
 * headless Node test environments (DataTexture fallback).
 */

import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  RepeatWrapping,
  Texture,
  SRGBColorSpace,
} from 'three';

const isBrowser =
  typeof document !== 'undefined' && typeof document.createElement === 'function';

/**
 * Creates a high-fidelity face texture capturing Veeramani's signature likeness:
 * - Warm South Indian skin tone with natural facial contours and highlights
 * - Signature thick black Tamil mustache curved over the upper lip
 * - Expressive dark brown eyes with white sclera, pupils, and specular glints
 * - Arched, thick masculine eyebrows
 * - Subtle 5 o'clock jawline stubble
 * - Defined nose bridge and natural lip contours
 */
export function createVeeramaniFaceTexture(): Texture {
  if (!isBrowser) {
    return createFallbackDataTexture(64, 64, [158, 102, 68, 255]);
  }

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return createFallbackDataTexture(32, 32, [158, 102, 68, 255]);

  // 1. Base skin tone gradient (warm Indian bronze complexion)
  const baseGrad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.48,
    size * 0.1,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  );
  baseGrad.addColorStop(0, '#ab724f');
  baseGrad.addColorStop(0.5, '#996241');
  baseGrad.addColorStop(0.85, '#875334');
  baseGrad.addColorStop(1, '#6c3f25');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle skin pores / micro-texture
  ctx.fillStyle = 'rgba(0, 0, 0, 0.025)';
  for (let i = 0; i < 600; i++) {
    const rx = Math.random() * size;
    const ry = Math.random() * size;
    ctx.fillRect(rx, ry, 2, 2);
  }

  // 2. Forehead highlight and temple shading
  const foreheadGrad = ctx.createLinearGradient(0, size * 0.15, 0, size * 0.35);
  foreheadGrad.addColorStop(0, 'rgba(215, 155, 120, 0.35)');
  foreheadGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = foreheadGrad;
  ctx.fillRect(size * 0.25, size * 0.12, size * 0.5, size * 0.25);

  // 3. Eyebrows (Thick, masculine, arched Tamil eyebrows)
  const drawEyebrow = (startX: number, endX: number, archY: number) => {
    ctx.save();
    ctx.strokeStyle = '#18120e';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, archY + 6);
    ctx.quadraticCurveTo((startX + endX) * 0.5, archY - 10, endX, archY + 4);
    ctx.stroke();

    // Feathered individual hair strokes
    ctx.strokeStyle = '#221914';
    ctx.lineWidth = 3;
    const count = 18;
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const x = startX + (endX - startX) * t;
      const y = archY + (t < 0.5 ? -t * 8 : -(1 - t) * 8);
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x + (startX < endX ? 3 : -3), y - 7);
      ctx.stroke();
    }
    ctx.restore();
  };
  drawEyebrow(size * 0.22, size * 0.44, size * 0.34);
  drawEyebrow(size * 0.78, size * 0.56, size * 0.34);

  // 4. Eyes (Expressive, warm, realistic)
  const drawEye = (cx: number, cy: number) => {
    ctx.save();
    // Eye socket soft shadow
    const socketGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 32);
    socketGrad.addColorStop(0, 'rgba(0,0,0,0)');
    socketGrad.addColorStop(1, 'rgba(45, 25, 15, 0.4)');
    ctx.fillStyle = socketGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 34, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sclera (eye white with subtle natural warm tone)
    ctx.fillStyle = '#f3eeea';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 26, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Iris (Deep warm brown with gradient)
    const irisGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 14);
    irisGrad.addColorStop(0, '#54321c');
    irisGrad.addColorStop(0.7, '#341d10');
    irisGrad.addColorStop(1, '#1b0e07');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#080503';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    // Specular corneal glint (vlogger eye spark)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 4, cy - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 4, cy + 3, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Eyelid crease and lashes
    ctx.strokeStyle = '#23140d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy + 2, 26, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    ctx.strokeStyle = '#3d2417';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 28, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
  };
  drawEye(size * 0.34, size * 0.41);
  drawEye(size * 0.66, size * 0.41);

  // 5. Nose (Defined bridge and realistic shading)
  ctx.save();
  // Nose bridge shadow
  const noseBridge = ctx.createLinearGradient(size * 0.46, 0, size * 0.54, 0);
  noseBridge.addColorStop(0, 'rgba(70, 38, 22, 0.45)');
  noseBridge.addColorStop(0.5, 'rgba(215, 155, 120, 0.35)');
  noseBridge.addColorStop(1, 'rgba(70, 38, 22, 0.45)');
  ctx.fillStyle = noseBridge;
  ctx.beginPath();
  ctx.moveTo(size * 0.48, size * 0.38);
  ctx.lineTo(size * 0.52, size * 0.38);
  ctx.lineTo(size * 0.54, size * 0.56);
  ctx.lineTo(size * 0.46, size * 0.56);
  ctx.closePath();
  ctx.fill();

  // Nose tip ball and nostrils
  ctx.fillStyle = 'rgba(215, 155, 120, 0.45)';
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.56, 12, 0, Math.PI * 2);
  ctx.fill();

  // Nostril shadows
  ctx.fillStyle = '#26130b';
  ctx.beginPath();
  ctx.ellipse(size * 0.45, size * 0.58, 6, 4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size * 0.55, size * 0.58, 6, 4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 6. Signature Veeramani Mustache (Iconic full, dark, curved Tamil mustache)
  ctx.save();
  ctx.fillStyle = '#140d0a';
  ctx.beginPath();
  // Center philtrum dip
  ctx.moveTo(size * 0.5, size * 0.62);
  // Right side wing
  ctx.bezierCurveTo(
    size * 0.58,
    size * 0.60,
    size * 0.72,
    size * 0.62,
    size * 0.78,
    size * 0.73,
  );
  // Bottom curve of right wing
  ctx.bezierCurveTo(
    size * 0.68,
    size * 0.75,
    size * 0.56,
    size * 0.73,
    size * 0.5,
    size * 0.67,
  );
  // Left side wing
  ctx.bezierCurveTo(
    size * 0.44,
    size * 0.73,
    size * 0.32,
    size * 0.75,
    size * 0.22,
    size * 0.73,
  );
  // Top curve of left wing back to center
  ctx.bezierCurveTo(
    size * 0.28,
    size * 0.62,
    size * 0.42,
    size * 0.60,
    size * 0.5,
    size * 0.62,
  );
  ctx.closePath();
  ctx.fill();

  // Fine mustache hair texture highlights
  ctx.strokeStyle = '#2e1e17';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 40; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const dist = (i / 40) * 85;
    const mx = size * 0.5 + side * dist;
    const my = size * 0.63 + Math.sin((i / 40) * Math.PI) * 22;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + side * 12, my + 6);
    ctx.stroke();
  }
  ctx.restore();

  // 7. Lips
  ctx.save();
  // Lower lip (warm natural terracotta tone)
  ctx.fillStyle = '#9c5243';
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.74, 24, 9, 0, 0, Math.PI);
  ctx.fill();
  // Lip highlight
  ctx.fillStyle = 'rgba(255, 180, 160, 0.25)';
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.75, 14, 4, 0, 0, Math.PI);
  ctx.fill();
  ctx.restore();

  // 8. Veeramani's signature chin and jawline stubble
  ctx.save();
  ctx.fillStyle = 'rgba(20, 14, 10, 0.4)';
  for (let y = size * 0.76; y < size * 0.95; y += 4) {
    const widthAtY = Math.sin(((y - size * 0.76) / (size * 0.19)) * Math.PI) * 120;
    for (let x = size * 0.5 - widthAtY; x < size * 0.5 + widthAtY; x += 5) {
      if (Math.random() > 0.3) {
        ctx.fillRect(
          x + (Math.random() * 3 - 1.5),
          y + (Math.random() * 3 - 1.5),
          2,
          2.5,
        );
      }
    }
  }
  ctx.restore();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearFilter;
  return texture;
}

/**
 * Creates a detailed fabric texture for Veeramani's shirt / kurta:
 * - Woven fabric pattern with high visual fidelity
 * - Distinctive stylish check / weave design matching Veeramani's reference photos
 * - Button placket and seam stitching
 */
export function createVeeramaniShirtTexture(): Texture {
  if (!isBrowser) {
    return createFallbackDataTexture(64, 64, [32, 138, 144, 255]);
  }

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return createFallbackDataTexture(32, 32, [32, 138, 144, 255]);

  // Base teal / cyan fabric tone (rich Indian kurta color from the game palette)
  ctx.fillStyle = '#1b7d82';
  ctx.fillRect(0, 0, size, size);

  // Subtle woven check pattern (authentic Tamil smart-casual attire)
  ctx.lineWidth = 3;
  const step = 28;
  for (let x = 0; x < size; x += step) {
    ctx.strokeStyle = x % (step * 2) === 0 ? 'rgba(18, 90, 95, 0.7)' : 'rgba(45, 175, 182, 0.4)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y < size; y += step) {
    ctx.strokeStyle = y % (step * 2) === 0 ? 'rgba(18, 90, 95, 0.7)' : 'rgba(45, 175, 182, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // Vertical center placket with button details
  const placketW = 44;
  const placketX = (size - placketW) / 2;
  ctx.fillStyle = '#146266';
  ctx.fillRect(placketX, 0, placketW, size);

  // Placket stitching lines
  ctx.strokeStyle = '#ffc94a'; // Gold accent thread stitching
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(placketX + 4, 0);
  ctx.lineTo(placketX + 4, size);
  ctx.moveTo(placketX + placketW - 4, 0);
  ctx.lineTo(placketX + placketW - 4, size);
  ctx.stroke();
  ctx.setLineDash([]);

  // Pearlescent buttons along placket
  for (let by = 70; by < size; by += 110) {
    // Button shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(size * 0.5, by + 2, 8, 0, Math.PI * 2);
    ctx.fill();

    // Button body
    ctx.fillStyle = '#e8eff2';
    ctx.beginPath();
    ctx.arc(size * 0.5, by, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Button rim & holes
    ctx.strokeStyle = '#c0d0d8';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#1a3a40';
    ctx.fillRect(size * 0.5 - 2.5, by - 2.5, 2, 2);
    ctx.fillRect(size * 0.5 + 1.5, by - 2.5, 2, 2);
    ctx.fillRect(size * 0.5 - 2.5, by + 1.5, 2, 2);
    ctx.fillRect(size * 0.5 + 1.5, by + 1.5, 2, 2);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearFilter;
  return texture;
}

/**
 * Creates a dark denim / twill trousers texture with stitching and pockets.
 */
export function createVeeramaniTrousersTexture(): Texture {
  if (!isBrowser) {
    return createFallbackDataTexture(64, 64, [55, 65, 79, 255]);
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return createFallbackDataTexture(32, 32, [55, 65, 79, 255]);

  ctx.fillStyle = '#2f3844';
  ctx.fillRect(0, 0, size, size);

  // Twill diagonal weave
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let i = -size; i < size * 2; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }

  // Seam stitching
  ctx.strokeStyle = '#b8944d'; // Amber denim thread
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(size * 0.5, 0);
  ctx.lineTo(size * 0.5, size);
  ctx.stroke();
  ctx.setLineDash([]);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * Creates high-detail running sneaker texture with athletic rubber soles.
 */
export function createVeeramaniSneakerTexture(): Texture {
  if (!isBrowser) {
    return createFallbackDataTexture(64, 64, [240, 240, 240, 255]);
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return createFallbackDataTexture(32, 32, [240, 240, 240, 255]);

  // Clean white sneaker body
  ctx.fillStyle = '#f6f7f9';
  ctx.fillRect(0, 0, size, size);

  // Athletic racing swoosh / stripe in teal and amber
  ctx.fillStyle = '#1f8a8f';
  ctx.beginPath();
  ctx.moveTo(size * 0.1, size * 0.55);
  ctx.quadraticCurveTo(size * 0.5, size * 0.45, size * 0.9, size * 0.35);
  ctx.lineTo(size * 0.9, size * 0.48);
  ctx.quadraticCurveTo(size * 0.5, size * 0.58, size * 0.1, size * 0.68);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffc94a';
  ctx.beginPath();
  ctx.moveTo(size * 0.1, size * 0.68);
  ctx.quadraticCurveTo(size * 0.5, size * 0.58, size * 0.9, size * 0.48);
  ctx.lineTo(size * 0.9, size * 0.55);
  ctx.quadraticCurveTo(size * 0.5, size * 0.65, size * 0.1, size * 0.75);
  ctx.closePath();
  ctx.fill();

  // Rubber sole tread pattern at the bottom
  ctx.fillStyle = '#e2e6ea';
  ctx.fillRect(0, size * 0.8, size, size * 0.2);
  ctx.strokeStyle = '#c8d0d8';
  ctx.lineWidth = 3;
  for (let x = 10; x < size; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, size * 0.82);
    ctx.lineTo(x, size * 0.98);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Fallback solid DataTexture for headless test environments (zero DOM dependencies).
 */
function createFallbackDataTexture(
  w: number,
  h: number,
  rgba: [number, number, number, number],
): DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  const tex = new DataTexture(data, w, h, RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}
