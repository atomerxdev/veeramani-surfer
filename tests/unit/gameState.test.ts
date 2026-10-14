import { describe, expect, it, vi } from 'vitest';
import { GameStateMachine } from '../../src/app/GameState';

describe('GameStateMachine', () => {
  it('starts in Loading', () => {
    const machine = new GameStateMachine();
    expect(machine.current).toBe('Loading');
    expect(machine.isPlaying()).toBe(false);
    expect(machine.isGameplayFrozen()).toBe(true);
  });

  it('walks the expected happy path', () => {
    const machine = new GameStateMachine();
    expect(machine.transition('MainMenu')).toBe(true);
    expect(machine.transition('Tutorial')).toBe(true);
    expect(machine.transition('Playing')).toBe(true);
    expect(machine.isPlaying()).toBe(true);
    expect(machine.isGameplayFrozen()).toBe(false);
    expect(machine.transition('Paused')).toBe(true);
    expect(machine.isGameplayFrozen()).toBe(true);
    expect(machine.transition('Playing')).toBe(true);
    expect(machine.transition('GameOver')).toBe(true);
    expect(machine.transition('Playing')).toBe(true);
  });

  it('reaches the opening intro from the menu and the tutorial, and only exits to Playing', () => {
    const fromMenu = new GameStateMachine();
    fromMenu.transition('MainMenu');
    expect(fromMenu.transition('Intro')).toBe(true);
    expect(fromMenu.transition('MainMenu')).toBe(false);
    expect(fromMenu.transition('Playing')).toBe(true);

    const fromTutorial = new GameStateMachine();
    fromTutorial.transition('MainMenu');
    fromTutorial.transition('Tutorial');
    expect(fromTutorial.transition('Intro')).toBe(true);
    expect(fromTutorial.transition('Paused')).toBe(false);
    expect(fromTutorial.transition('Playing')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    const machine = new GameStateMachine();
    expect(machine.transition('Paused')).toBe(false);
    expect(machine.current).toBe('Loading');
    machine.transition('MainMenu');
    expect(machine.transition('GameOver')).toBe(false);
    expect(machine.transition('Paused')).toBe(false);
    expect(machine.current).toBe('MainMenu');
  });

  it('rejects a transition to the current state', () => {
    const machine = new GameStateMachine();
    machine.transition('MainMenu');
    expect(machine.transition('MainMenu')).toBe(false);
  });

  it('remembers where settings was opened from', () => {
    const paused = new GameStateMachine();
    paused.transition('MainMenu');
    paused.transition('Playing');
    paused.transition('Paused');
    expect(paused.transition('Settings')).toBe(true);
    expect(paused.settingsReturnState).toBe('Paused');
    expect(paused.transition(paused.settingsReturnState)).toBe(true);
    expect(paused.current).toBe('Paused');

    const menu = new GameStateMachine();
    menu.transition('MainMenu');
    menu.transition('Settings');
    expect(menu.settingsReturnState).toBe('MainMenu');
    menu.transition('MainMenu');
    expect(menu.current).toBe('MainMenu');
  });

  it('remembers where leaderboard was opened from', () => {
    const fromMenu = new GameStateMachine();
    fromMenu.transition('MainMenu');
    expect(fromMenu.transition('Leaderboard')).toBe(true);
    expect(fromMenu.leaderboardReturnState).toBe('MainMenu');
    expect(fromMenu.transition(fromMenu.leaderboardReturnState)).toBe(true);
    expect(fromMenu.current).toBe('MainMenu');

    const fromGameOver = new GameStateMachine();
    fromGameOver.transition('MainMenu');
    fromGameOver.transition('Playing');
    fromGameOver.transition('GameOver');
    expect(fromGameOver.transition('Leaderboard')).toBe(true);
    expect(fromGameOver.leaderboardReturnState).toBe('GameOver');
    expect(fromGameOver.transition(fromGameOver.leaderboardReturnState)).toBe(true);
    expect(fromGameOver.current).toBe('GameOver');
  });

  it('notifies listeners and unsubscribes cleanly', () => {
    const machine = new GameStateMachine();
    const listener = vi.fn();
    const unsubscribe = machine.onChange(listener);
    machine.transition('MainMenu');
    expect(listener).toHaveBeenCalledWith({ from: 'Loading', to: 'MainMenu' });
    unsubscribe();
    machine.transition('Tutorial');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reset() forces a state without validation', () => {
    const machine = new GameStateMachine();
    machine.reset('Playing');
    expect(machine.current).toBe('Playing');
    expect(machine.isPlaying()).toBe(true);
  });
});
