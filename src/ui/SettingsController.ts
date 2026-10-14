/**
 * Settings screen: graphics quality, reduced motion, sound, touch pad visibility,
 * and a destructive reset of saved data. Values are read from and written back to
 * the stored profile, so settings persist between sessions.
 */

import type { GraphicsQuality } from '../app/GameConfig';
import type { StoredSettings } from '../core/StorageManager';
import { bindTarget, setTextIfChanged } from './Dom';

export interface SettingsChange {
  quality: GraphicsQuality;
  reducedMotion: boolean;
  sound: boolean;
  touchPad: boolean;
}

export class SettingsController {
  private readonly root = document.querySelector<HTMLElement>('[data-screen="settings"]');
  private readonly quality = document.querySelector<HTMLSelectElement>('#setting-quality');
  private readonly reducedMotion = document.querySelector<HTMLInputElement>(
    '#setting-reduced-motion',
  );
  private readonly sound = document.querySelector<HTMLInputElement>('#setting-sound');
  private readonly touchPad = document.querySelector<HTMLInputElement>('#setting-touch-pad');
  private readonly seedLine = bindTarget(document, 'seed-line');

  get element(): HTMLElement | null {
    return this.root;
  }

  /** Push stored values into the controls. */
  sync(settings: StoredSettings): void {
    if (this.quality) this.quality.value = settings.quality;
    if (this.reducedMotion) this.reducedMotion.checked = settings.reducedMotion;
    if (this.sound) this.sound.checked = settings.sound;
    if (this.touchPad) this.touchPad.checked = settings.touchPad;
  }

  setSeedLabel(seed: number | null): void {
    setTextIfChanged(this.seedLine, seed === null ? 'Track seed: random' : `Track seed: ${seed}`);
  }

  /** Read the current control values (used on every change event). */
  read(): SettingsChange {
    return {
      quality: (this.quality?.value as GraphicsQuality | undefined) ?? 'medium',
      reducedMotion: this.reducedMotion?.checked ?? false,
      sound: this.sound?.checked ?? true,
      touchPad: this.touchPad?.checked ?? false,
    };
  }
}
