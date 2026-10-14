/**
 * Central game state machine. Only the Playing state advances gameplay; every
 * other state either renders a frozen frame or runs the harmless attract-mode
 * scroll behind the menus.
 */

export type GameStateName =
  | 'Loading'
  | 'MainMenu'
  | 'Tutorial'
  | 'Settings'
  | 'Leaderboard'
  | 'Intro'
  | 'Playing'
  | 'Paused'
  | 'GameOver';

export interface StateChange {
  readonly from: GameStateName;
  readonly to: GameStateName;
}

type Listener = (change: StateChange) => void;

/**
 * Explicit transition table: anything not listed here is rejected.
 *
 * 'Intro' is reachable from every screen whose Play / Start-running button is
 * wired to GameApp.startIntro (the main menu and the tutorial), and it always
 * hands over to Playing - there is no way back into the menu from the intro.
 */
const ALLOWED: Record<GameStateName, readonly GameStateName[]> = {
  Loading: ['MainMenu', 'Tutorial', 'Playing'],
  MainMenu: ['Intro', 'Playing', 'Tutorial', 'Settings', 'Leaderboard', 'Loading'],
  Tutorial: ['Intro', 'Playing', 'MainMenu'],
  Settings: ['MainMenu', 'Paused', 'GameOver'],
  Leaderboard: ['MainMenu', 'GameOver', 'Playing'],
  Intro: ['Playing'],
  Playing: ['Paused', 'GameOver', 'MainMenu'],
  Paused: ['Playing', 'GameOver', 'MainMenu', 'Settings'],
  GameOver: ['Playing', 'MainMenu', 'Settings', 'Leaderboard'],
};

export class GameStateMachine {
  private state: GameStateName = 'Loading';
  private readonly listeners = new Set<Listener>();
  private history: GameStateName[] = ['Loading'];

  get current(): GameStateName {
    return this.state;
  }

  /** State to return to when the settings screen is closed. */
  private settingsReturn: GameStateName = 'MainMenu';

  get settingsReturnState(): GameStateName {
    return this.settingsReturn;
  }

  /** State to return to when the leaderboard screen is closed. */
  private leaderboardReturn: GameStateName = 'MainMenu';

  get leaderboardReturnState(): GameStateName {
    return this.leaderboardReturn;
  }

  canTransition(to: GameStateName): boolean {
    if (to === this.state) return false;
    return ALLOWED[this.state].includes(to);
  }

  transition(to: GameStateName): boolean {
    if (!this.canTransition(to)) return false;
    const from = this.state;
    if (to === 'Settings' && (from === 'MainMenu' || from === 'Paused' || from === 'GameOver')) {
      this.settingsReturn = from;
    }
    if (to === 'Leaderboard' && (from === 'MainMenu' || from === 'GameOver')) {
      this.leaderboardReturn = from;
    }
    this.state = to;
    this.history.push(to);
    if (this.history.length > 32) this.history.shift();
    for (const listener of this.listeners) listener({ from, to });
    return true;
  }

  /** Force a state without validation. Used only when (re)starting a run. */
  reset(to: GameStateName = 'Loading'): void {
    const from = this.state;
    this.state = to;
    this.history = [to];
    if (from !== to) for (const listener of this.listeners) listener({ from, to });
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isPlaying(): boolean {
    return this.state === 'Playing';
  }

  /** Gameplay is frozen in every state except Playing. */
  isGameplayFrozen(): boolean {
    return this.state !== 'Playing';
  }
}
