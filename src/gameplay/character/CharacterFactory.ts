/**
 * Character factory.
 *
 * The only place that decides which concrete rig to build. To ship a rigged GLB
 * protagonist later, implement `CharacterRig` on a `GlbCharacter` class and return
 * it here when the model has loaded - nothing else in the codebase changes.
 */

import type { CharacterRig } from './CharacterRig';
import {
  DELIVERY_BOY_1_PALETTE,
  DELIVERY_BOY_2_PALETTE,
  PROTAGONIST_PALETTE,
  ProceduralCharacter,
  type CharacterPalette,
} from './ProceduralCharacter';
import { VeeramaniCharacter } from './VeeramaniCharacter';

/**
 * 'protagonist' is Veeramani himself. 'delivery1' and 'delivery2' are the two
 * delivery boys who chase him; 'rider' remains a supported alias for delivery1.
 */
export type CharacterKind = 'protagonist' | 'delivery1' | 'delivery2' | 'rider';

export function createCharacter(kind: CharacterKind): CharacterRig {
  if (kind === 'protagonist') {
    return new VeeramaniCharacter();
  }
  return new ProceduralCharacter(paletteFor(kind));
}

export function paletteFor(kind: CharacterKind): CharacterPalette {
  switch (kind) {
    case 'delivery1':
    case 'rider':
      return DELIVERY_BOY_1_PALETTE;
    case 'delivery2':
      return DELIVERY_BOY_2_PALETTE;
    default:
      return PROTAGONIST_PALETTE;
  }
}
