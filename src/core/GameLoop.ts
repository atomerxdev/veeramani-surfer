/**
 * Frame-rate independent game loop.
 *
 * Gameplay runs on a fixed timestep (default 1/60 s) with an accumulator, so
 * physics is identical whether the browser gives us 30 fps or 240 fps. Rendering
 * happens once per animation frame. Long frames are clamped so a background tab
 * or a stalled frame cannot teleport the world.
 */

export interface GameLoopOptions {
  /** Simulation step in seconds. */
  readonly fixedStep?: number;
  /** Maximum simulation steps per frame; protects against spiral of death. */
  readonly maxSubSteps?: number;
  /** Largest real-time delta (seconds) accepted from one frame. */
  readonly maxFrameDelta?: number;
}

export type UpdateFn = (fixedDelta: number, elapsed: number) => void;
export type RenderFn = (alpha: number, delta: number) => void;

export class GameLoop {
  private readonly fixedStep: number;
  private readonly maxSubSteps: number;
  private readonly maxFrameDelta: number;

  private rafId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private elapsed = 0;
  private running = false;
  private hidden = false;

  /** Number of simulated steps in the last frame; handy in tests/debug. */
  lastStepCount = 0;

  constructor(
    private readonly update: UpdateFn,
    private readonly render: RenderFn,
    options: GameLoopOptions = {},
    private readonly onVisibilityChange?: (visible: boolean) => void,
  ) {
    this.fixedStep = options.fixedStep ?? 1 / 60;
    this.maxSubSteps = options.maxSubSteps ?? 5;
    this.maxFrameDelta = options.maxFrameDelta ?? 0.25;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.accumulator = 0;
    this.lastTime = now();
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private handleVisibility = (): void => {
    const visible = !document.hidden;
    this.hidden = !visible;
    // Drop the stale delta so nothing is simulated for the hidden period.
    this.lastTime = now();
    this.accumulator = 0;
    this.onVisibilityChange?.(visible);
  };

  private tick = (time: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);
    if (this.hidden) {
      this.lastTime = time;
      return;
    }

    let delta = (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;
    if (delta > this.maxFrameDelta) delta = this.maxFrameDelta;

    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < this.maxSubSteps) {
      this.accumulator -= this.fixedStep;
      this.elapsed += this.fixedStep;
      this.update(this.fixedStep, this.elapsed);
      steps += 1;
    }
    // If we blew the step budget the accumulator keeps the remainder, but never
    // more than a single step, so the game slows down instead of exploding.
    if (steps >= this.maxSubSteps) this.accumulator = 0;
    this.lastStepCount = steps;

    const alpha = this.accumulator / this.fixedStep;
    this.render(alpha, delta);
  };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
