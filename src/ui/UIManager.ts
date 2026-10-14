/**
 * UI manager.
 *
 * One authority for which screen is visible: it maps the game state straight onto
 * the DOM, so a stale overlay can never survive a restart and two menus can never
 * be open at once. All buttons are handled with a single delegated listener, which
 * keeps teardown trivial and makes "which button did what" easy to audit.
 */

import type { GameStateName } from '../app/GameState';
import type { StoredProfile } from '../core/StorageManager';
import { HUDController } from './HUDController';
import { MenuController } from './MenuController';
import { PauseController } from './PauseController';
import { GameOverController, type GameOverSummary } from './GameOverController';
import { SettingsController, type SettingsChange } from './SettingsController';
import { VlogController } from './VlogController';
import { LeaderboardController } from './LeaderboardController';
import { optionalElement } from './Dom';

export interface UIActions {
  onPlay(): void;
  onRestart(): void;
  onResume(): void;
  onPause(): void;
  onQuit(): void;
  onTutorial(): void;
  onOpenSettings(): void;
  onCloseSettings(): void;
  onLeaderboard(): void;
  onCloseLeaderboard(): void;
  onSubmitScore?(): void;
  onRandomName?(): void;
  onPlayerNameChanged?(name: string): void;
  onToggleMute(): void;
  onResetData(): void;
  onSettingsChanged(change: SettingsChange): void;
  onUserGesture?(): void;
}

const ACTION_MAP: Record<string, keyof UIActions> = {
  play: 'onPlay',
  restart: 'onRestart',
  resume: 'onResume',
  pause: 'onPause',
  quit: 'onQuit',
  menu: 'onQuit',
  tutorial: 'onTutorial',
  settings: 'onOpenSettings',
  'close-settings': 'onCloseSettings',
  leaderboard: 'onLeaderboard',
  'close-leaderboard': 'onCloseLeaderboard',
  'submit-score': 'onSubmitScore',
  'random-name': 'onRandomName',
  'toggle-mute': 'onToggleMute',
  'reset-data': 'onResetData',
};

const HUD_STATES: readonly GameStateName[] = ['Playing', 'Paused'];

export class UIManager {
  readonly hud = new HUDController();
  readonly menu = new MenuController();
  readonly pause = new PauseController();
  readonly gameover = new GameOverController();
  readonly settings = new SettingsController();
  readonly vlog = new VlogController();
  readonly leaderboard: LeaderboardController;

  private readonly screens = new Map<string, HTMLElement>();
  private readonly touchPad = optionalElement<HTMLElement>(document, '[data-touch-pad]');
  private readonly status = optionalElement<HTMLElement>(document, '#a11y-status');
  private readonly element: HTMLElement | null;
  private state: GameStateName = 'Loading';
  private settingsOpen = false;
  private touchPadEnabled = false;
  private touchPadForced = false;

  constructor(
    private readonly actions: UIActions,
    options: { touchDevice?: boolean } = {},
  ) {
    this.leaderboard = new LeaderboardController();
    this.element = optionalElement<HTMLElement>(document, '#ui-root');
    if (!this.element) throw new Error('UI root element is missing');
    this.touchPadEnabled = options.touchDevice ?? false;

    for (const node of Array.from(this.element.querySelectorAll<HTMLElement>('[data-screen]'))) {
      const name = node.dataset['screen'];
      if (name) this.screens.set(name, node);
    }

    this.element.addEventListener('click', this.handleClick);
    this.element.addEventListener('change', this.handleChange);
    this.element.addEventListener('input', this.handleInput);
    this.applyVisibility();
  }

  /* ------------------------------------------------------------- public API */

  /** Called by GameApp whenever the state machine moves. */
  setGameState(state: GameStateName): void {
    this.state = state;
    if (state !== 'Settings') this.settingsOpen = false;
    this.applyVisibility();
  }

  openSettings(): void {
    this.settingsOpen = true;
    this.applyVisibility();
  }

  closeSettings(): void {
    this.settingsOpen = false;
    this.applyVisibility();
  }

  get isSettingsOpen(): boolean {
    return this.settingsOpen;
  }

  syncProfile(profile: StoredProfile): void {
    this.menu.sync(profile);
    this.settings.sync(profile.settings);
    this.setTouchPadForced(profile.settings.touchPad);
  }

  /** Show which seed the current track was generated from (or "random"). */
  setSeedLabel(seed: number | null): void {
    this.settings.setSeedLabel(seed);
  }

  showGameOver(summary: GameOverSummary): void {
    this.gameover.show(summary);
  }

  setTouchPadForced(forced: boolean): void {
    this.touchPadForced = forced;
    this.applyVisibility();
  }

  /** Enable the touch pad for devices that report touch input. */
  setTouchCapable(capable: boolean): void {
    this.touchPadEnabled = capable;
    this.applyVisibility();
  }

  /** Announce something to assistive technology. */
  announce(message: string): void {
    if (!this.status) return;
    this.status.textContent = message;
  }

  dispose(): void {
    this.element?.removeEventListener('click', this.handleClick);
    this.element?.removeEventListener('change', this.handleChange);
    this.element?.removeEventListener('input', this.handleInput);
  }

  /* --------------------------------------------------------------- internals */

  private applyVisibility(): void {
    const showHud = HUD_STATES.includes(this.state);
    const settingsVisible = this.settingsOpen;
    const touchPadVisible =
      showHud && this.state === 'Playing' && (this.touchPadEnabled || this.touchPadForced);

    this.toggle('loading', this.state === 'Loading');
    this.toggle('menu', this.state === 'MainMenu');
    this.toggle('tutorial', this.state === 'Tutorial');
    this.toggle('vlog', this.state === 'Intro');
    this.toggle('settings', settingsVisible);
    this.toggle('hud', showHud && !settingsVisible);
    this.toggle('pause', this.state === 'Paused' && !settingsVisible);
    this.toggle('gameover', this.state === 'GameOver');
    this.toggle('leaderboard', this.state === 'Leaderboard');
    this.touchPad?.classList.toggle('is-visible', touchPadVisible);
  }

  private toggle(name: string, visible: boolean): void {
    const node = this.screens.get(name);
    if (!node) return;
    node.classList.toggle('is-active', visible);
  }

  private handleClick = (event: MouseEvent): void => {
    this.actions.onUserGesture?.();
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>('[data-action]');
    if (!button) return;
    const action = button.dataset['action'];
    if (!action) return;
    const handlerName = ACTION_MAP[action];
    if (!handlerName) return;
    event.preventDefault();
    const handler = this.actions[handlerName] as (() => void) | undefined;
    handler?.call(this.actions);
  };

  private handleChange = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (target?.id === 'menu-player-name') {
      const val = (target as HTMLInputElement).value;
      this.actions.onPlayerNameChanged?.(val);
      return;
    }
    if (!target?.dataset['setting']) return;
    this.actions.onSettingsChanged(this.settings.read());
  };

  private handleInput = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (target?.id === 'menu-player-name') {
      const val = (target as HTMLInputElement).value;
      this.actions.onPlayerNameChanged?.(val);
    }
  };
}
