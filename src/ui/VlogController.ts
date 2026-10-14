/**
 * Opening vlog overlay.
 *
 * Drives the REC chip, the caption of whatever Veeramani is saying and the hint
 * underneath. It only ever writes text, so it costs nothing per frame and stays
 * silent when the markup is missing (for example in a DOM-free unit test).
 *
 * Visibility is owned by UIManager: the overlay is active only in the Intro
 * state, which is what makes it read as "he is filming" rather than a menu.
 */

import { bindTarget, optionalElement, setTextIfChanged } from './Dom';

export class VlogController {
  private readonly root = optionalElement<HTMLElement>(document, '[data-screen="vlog"]');
  private readonly caption = bindTarget(document, 'vlog-caption');
  private readonly hint = bindTarget(document, 'vlog-hint');

  /** Replace the spoken line and the small hint below it. */
  setLine(caption: string, hint: string): void {
    setTextIfChanged(this.caption, caption);
    setTextIfChanged(this.hint, hint);
  }

  /** Flip the overlay into its "I have been spotted" state for the chase beat. */
  setAlarmed(alarmed: boolean): void {
    this.root?.classList.toggle('is-alarmed', alarmed);
  }
}
