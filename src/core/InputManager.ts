/**
 * Keyboard + touch input.
 *
 * Design rules:
 *  - Actions are edge triggered. Auto-repeat (event.repeat) is ignored so a held
 *    key cannot spam lane changes.
 *  - Swipes fire as soon as the gesture crosses the threshold (not on release)
 *    so controls feel immediate, but only one swipe per finger gesture.
 *  - When disabled (menus, pause, game over) every gameplay input is dropped.
 *  - All listeners are removable so nothing leaks across app restarts.
 */

export type InputAction = 'left' | 'right' | 'jump' | 'slide' | 'pause' | 'mute';

export interface InputHandlers {
  onAction(action: InputAction): void;
}

export interface InputOptions {
  /** Minimum travel in CSS pixels before a touch/pointer drag counts as a swipe. */
  readonly swipeThreshold?: number;
}

const KEY_MAP: Record<string, InputAction> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'slide',
  KeyS: 'slide',
  Escape: 'pause',
  KeyM: 'mute',
};

const PREVENT_DEFAULT_KEYS = new Set(Object.keys(KEY_MAP));

/**
 * Actions that must keep working even when gameplay input is disabled: the pause
 * key has to be able to un-pause, and mute has to work from any screen.
 */
const ALWAYS_FORWARDED: ReadonlySet<InputAction> = new Set<InputAction>(['pause', 'mute']);

export class InputManager {
  private enabled = false;
  private readonly swipeThreshold: number;
  private attached = false;

  // Active pointer gesture state.
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private gestureConsumed = false;

  constructor(
    private readonly surface: HTMLElement,
    private readonly handlers: InputHandlers,
    options: InputOptions = {},
  ) {
    this.swipeThreshold = options.swipeThreshold ?? 26;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.cancelGesture();
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    this.surface.addEventListener('pointerdown', this.onPointerDown);
    this.surface.addEventListener('pointermove', this.onPointerMove);
    this.surface.addEventListener('pointerup', this.onPointerUp);
    this.surface.addEventListener('pointercancel', this.onPointerCancel);
    this.surface.addEventListener('pointerleave', this.onPointerUp);
    // Belt and braces: stop the page scrolling behind the canvas on mobile.
    this.surface.addEventListener('touchmove', this.preventDefault, { passive: false });
    this.surface.addEventListener('contextmenu', this.preventDefault);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('pointermove', this.onPointerMove);
    this.surface.removeEventListener('pointerup', this.onPointerUp);
    this.surface.removeEventListener('pointercancel', this.onPointerCancel);
    this.surface.removeEventListener('pointerleave', this.onPointerUp);
    this.surface.removeEventListener('touchmove', this.preventDefault);
    this.surface.removeEventListener('contextmenu', this.preventDefault);
    this.cancelGesture();
  }

  private preventDefault = (event: Event): void => {
    if (this.enabled) event.preventDefault();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const action = KEY_MAP[event.code];
    if (!action) return;
    if (this.enabled && PREVENT_DEFAULT_KEYS.has(event.code)) event.preventDefault();
    // Gameplay input is gated while menus are open, but pause/mute are global.
    if (!this.enabled && !ALWAYS_FORWARDED.has(action)) return;
    if (event.repeat) return; // keyboard auto-repeat must never spam actions
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    this.handlers.onAction(action);
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    if (this.pointerId !== null) return; // one gesture at a time
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.gestureConsumed = false;
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled || this.pointerId === null || event.pointerId !== this.pointerId) return;
    if (this.gestureConsumed) return;
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    if (Math.abs(dx) < this.swipeThreshold && Math.abs(dy) < this.swipeThreshold) return;

    const action: InputAction = Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? 'right'
        : 'left'
      : dy > 0
        ? 'slide'
        : 'jump';

    this.gestureConsumed = true;
    // Reset the origin so a long drag can still trigger a follow-up swipe once
    // the finger travels the threshold again.
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.handlers.onAction(action);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.pointerId === null || event.pointerId !== this.pointerId) return;
    if (!this.gestureConsumed) this.finalizeSwipe(event.clientX, event.clientY);
    this.cancelGesture();
  };

  private onPointerCancel = (): void => {
    this.cancelGesture();
  };

  /** Handles the case where pointer events never delivered a move (fast flick). */
  private finalizeSwipe(x: number, y: number): void {
    if (!this.enabled) return;
    const dx = x - this.startX;
    const dy = y - this.startY;
    if (Math.abs(dx) < this.swipeThreshold && Math.abs(dy) < this.swipeThreshold) return;
    const action: InputAction = Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? 'right'
        : 'left'
      : dy > 0
        ? 'slide'
        : 'jump';
    this.gestureConsumed = true;
    this.handlers.onAction(action);
  }

  private cancelGesture(): void {
    this.pointerId = null;
    this.gestureConsumed = false;
  }
}

/**
 * Wires the on-screen touch pad buttons (used on phones and by automated tests).
 * Buttons dispatch on pointerdown so they feel as fast as a swipe.
 */
export function bindTouchPad(
  root: ParentNode,
  dispatch: (action: InputAction) => void,
  isEnabled: () => boolean,
): () => void {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-touch-action]'));
  const listeners: Array<() => void> = [];

  for (const button of buttons) {
    const action = button.dataset['touchAction'] as InputAction | undefined;
    if (!action) continue;
    const handler = (event: PointerEvent): void => {
      event.preventDefault();
      if (!isEnabled()) return;
      button.classList.add('is-pressed');
      dispatch(action);
    };
    const release = (): void => button.classList.remove('is-pressed');
    button.addEventListener('pointerdown', handler);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('pointercancel', release);
    // Keyboard accessibility: Enter/Space on a focused button.
    const keyHandler = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (!isEnabled()) return;
      dispatch(action);
    };
    button.addEventListener('keydown', keyHandler);
    listeners.push(() => {
      button.removeEventListener('pointerdown', handler);
      button.removeEventListener('pointerup', release);
      button.removeEventListener('pointerleave', release);
      button.removeEventListener('pointercancel', release);
      button.removeEventListener('keydown', keyHandler);
    });
  }

  return () => {
    for (const dispose of listeners) dispose();
  };
}
