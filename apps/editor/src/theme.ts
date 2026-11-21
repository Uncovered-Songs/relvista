/**
 * light / dark / system, stored in localStorage 'theme' ('light' | 'dark'; removed for system)
 * — the same key Docusaurus uses on this origin, so docs and editor share one choice.
 */
import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ThemeMode = 'light' | 'dark';

const KEY = 'theme';
const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

let choice: ThemeChoice = typeof window === 'undefined' ? 'system' : readChoice();
let mode: ThemeMode = resolve(choice);

function resolve(c: ThemeChoice): ThemeMode {
  return c === 'system' ? (systemDark() ? 'dark' : 'light') : c;
}

function apply(): void {
  mode = resolve(choice);
  document.documentElement.setAttribute('data-theme', mode);
  for (const l of listeners) l();
}

export function initTheme(): void {
  apply();
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (choice === 'system') apply();
    });
  }
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) {
      choice = readChoice();
      apply();
    }
  });
}

export function setTheme(next: ThemeChoice): void {
  choice = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // private mode: the choice lasts for this page only
  }
  apply();
}

/** system → light → dark → system. */
export function cycleTheme(): ThemeChoice {
  const next: ThemeChoice = choice === 'system' ? 'light' : choice === 'light' ? 'dark' : 'system';
  setTheme(next);
  return next;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTheme(): { choice: ThemeChoice; mode: ThemeMode } {
  const c = useSyncExternalStore(
    subscribe,
    () => choice,
    () => 'system' as ThemeChoice,
  );
  const m = useSyncExternalStore(
    subscribe,
    () => mode,
    () => 'light' as ThemeMode,
  );
  return { choice: c, mode: m };
}

export function currentMode(): ThemeMode {
  return mode;
}
