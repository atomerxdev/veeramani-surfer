/**
 * World palette.
 *
 * A tight, cheerful market palette: warm terracotta and turmeric walls, teal and
 * leaf-green accents, dusty asphalt, marigold awnings. Every material in the game
 * comes from here so the art direction stays consistent.
 */

export const Palette = {
  sky: 0x9fd8f0,
  fog: 0xbfe3f2,
  sunLight: 0xfff2d6,
  ambientSky: 0xfff0d2,
  ambientGround: 0xb0713c,

  asphalt: 0x6d6259,
  asphaltDark: 0x5b5148,
  roadLine: 0xf3e6c8,
  kerb: 0xcfc2a8,
  pavement: 0xd9cbb0,
  dirt: 0x8a6a45,

  wall: [0xf6c46a, 0xe98b5a, 0xf2e0bd, 0xc9dcb2, 0x9fd0d6, 0xe7b8c8],
  wallTrim: 0xfdf3dd,
  roof: [0xb0523a, 0x8d6c4a, 0x5c7f7a],
  window: 0x38424f,
  shutter: 0x2f7f86,

  awning: [0xe8523f, 0x2f9c8f, 0xf2b12b, 0x3f7fbf, 0x7bbf4b, 0xd957a2],
  tarp: 0x2f9c8f,
  wood: 0xa9743f,
  woodDark: 0x7d5328,
  crate: 0xd6a35c,
  crateDark: 0xb07f3c,
  metal: 0x9aa3ad,
  metalDark: 0x6a727c,
  tyre: 0x2b2b2b,
  cloth: [0xffd166, 0xef6f6c, 0x6a8caf, 0x7fc8a9, 0xf2f7f2],
  token: 0xffc93c,
  tokenDark: 0xd98f0b,
  crash: 0xff7043,
  shield: 0x4fc3f7,
  magnet: 0xff5f8f,
  multiplier: 0xb388ff,
  boost: 0x7bff8f,
  produce: [0xe23b2e, 0xf5a623, 0x7fbf3f, 0xc45ac4, 0xf3e04a],
  leaf: 0x3f9b4f,

  // Veeramani Surfer branding for the two delivery boys.
  veeramaniShirt: 0x1f8a8f,
  veeramaniAccent: 0xffc94a,
  deliveryShirt: 0xff5a1f,
  deliveryAccent: 0xf5f0e6,
} as const;

export function deliveryShirtColor(): number {
  return Palette.deliveryShirt;
}

export function deliveryAccentColor(): number {
  return Palette.deliveryAccent;
}

export function veeramaniShirtColor(): number {
  return Palette.veeramaniShirt;
}

export function veeramaniAccentColor(): number {
  return Palette.veeramaniAccent;
}

export function pickWall(index: number): number {
  return Palette.wall[index % Palette.wall.length] as number;
}

export function pickAwning(index: number): number {
  return Palette.awning[index % Palette.awning.length] as number;
}

export function pickRoof(index: number): number {
  return Palette.roof[index % Palette.roof.length] as number;
}

export function pickCloth(index: number): number {
  return Palette.cloth[index % Palette.cloth.length] as number;
}

export function pickProduce(index: number): number {
  return Palette.produce[index % Palette.produce.length] as number;
}
