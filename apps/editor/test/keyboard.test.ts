// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  isMacPlatform,
  matchDiagramKey,
  matchShortcut,
  shortcutRows,
  zoneOf,
  type KeyLike,
} from '../src/keyboard.js';

const k = (key: string, code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('keyboard', () => {
  it('Mod is Cmd on macOS and Ctrl elsewhere', () => {
    expect(matchShortcut(k('s', 'KeyS', { metaKey: true }), 'other', true)).toBe('save');
    expect(matchShortcut(k('s', 'KeyS', { ctrlKey: true }), 'other', true)).toBeNull();
    expect(matchShortcut(k('s', 'KeyS', { ctrlKey: true }), 'other', false)).toBe('save');
    expect(matchShortcut(k('S', 'KeyS', { ctrlKey: true, shiftKey: true }), 'other', false)).toBe(
      'saveAs',
    );
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('Win32')).toBe(false);
  });
  it('undo routing by focus', () => {
    const undo = k('z', 'KeyZ', { ctrlKey: true });
    expect(matchShortcut(undo, 'monaco', false)).toBeNull();
    expect(matchShortcut(undo, 'input', false)).toBeNull();
    expect(matchShortcut(undo, 'diagram', false)).toBe('undo');
    expect(matchShortcut(undo, 'other', false)).toBe('undo');
    expect(matchShortcut(k('Z', 'KeyZ', { ctrlKey: true, shiftKey: true }), 'diagram', false)).toBe(
      'redo',
    );
    expect(matchShortcut(k('y', 'KeyY', { ctrlKey: true }), 'other', false)).toBe('redo');
    expect(matchShortcut(k('y', 'KeyY', { ctrlKey: true }), 'monaco', false)).toBeNull();
  });
  it('auto-layout uses the physical key (Alt changes e.key on macOS)', () => {
    expect(matchShortcut(k('¬', 'KeyL', { metaKey: true, altKey: true }), 'monaco', true)).toBe(
      'autoLayout',
    );
  });
  it('diagram-only keys and help', () => {
    expect(matchShortcut(k('!', 'Digit1', { shiftKey: true }), 'diagram', false)).toBe('fit');
    expect(matchShortcut(k('!', 'Digit1', { shiftKey: true }), 'monaco', false)).toBeNull();
    expect(matchShortcut(k('+', 'Equal', { shiftKey: true }), 'diagram', false)).toBe('zoomIn');
    expect(matchShortcut(k('-', 'Minus'), 'diagram', false)).toBe('zoomOut');
    expect(matchShortcut(k('?', 'Slash', { shiftKey: true }), 'other', false)).toBe('help');
    expect(matchShortcut(k('?', 'Slash', { shiftKey: true }), 'monaco', false)).toBeNull();
    expect(matchShortcut(k('1', 'Digit1', { altKey: true }), 'monaco', false)).toBe('focusCode');
  });
  it('zones', () => {
    document.body.innerHTML =
      '<div class="monaco-editor"><textarea id="m"></textarea></div><div class="rv-canvas"><div id="n" tabindex="0"></div></div><input id="i"><button id="b"></button>';
    expect(zoneOf(document.getElementById('m'))).toBe('monaco');
    expect(zoneOf(document.getElementById('n'))).toBe('diagram');
    expect(zoneOf(document.getElementById('i'))).toBe('input');
    expect(zoneOf(document.getElementById('b'))).toBe('other');
    expect(zoneOf(null)).toBe('other');
  });
  it('text fields inside the diagram are input, not diagram', () => {
    document.body.innerHTML =
      '<div class="rv-canvas"><textarea id="t"></textarea><input id="f"><button id="b"></button></div>';
    expect(zoneOf(document.getElementById('t'))).toBe('input');
    expect(zoneOf(document.getElementById('f'))).toBe('input');
    expect(zoneOf(document.getElementById('b'))).toBe('diagram');
  });
  it('diagram keys: N, Enter / F2, Delete / Backspace only with the diagram focused', () => {
    expect(matchDiagramKey(k('n', 'KeyN'), 'diagram')).toBe('newNote');
    expect(matchDiagramKey(k('N', 'KeyN'), 'diagram')).toBe('newNote'); // caps lock
    expect(matchDiagramKey(k('Enter', 'Enter'), 'diagram')).toBe('editNote');
    expect(matchDiagramKey(k('F2', 'F2'), 'diagram')).toBe('editNote');
    expect(matchDiagramKey(k('Delete', 'Delete'), 'diagram')).toBe('deleteSelection');
    expect(matchDiagramKey(k('Backspace', 'Backspace'), 'diagram')).toBe('deleteSelection');
    for (const zone of ['monaco', 'input', 'other'] as const) {
      expect(matchDiagramKey(k('n', 'KeyN'), zone)).toBeNull();
      expect(matchDiagramKey(k('Enter', 'Enter'), zone)).toBeNull();
      expect(matchDiagramKey(k('Backspace', 'Backspace'), zone)).toBeNull();
    }
    // Modified keys are someone else's (Mod+N, Shift+Enter, Alt+Backspace).
    expect(matchDiagramKey(k('n', 'KeyN', { ctrlKey: true }), 'diagram')).toBeNull();
    expect(matchDiagramKey(k('n', 'KeyN', { metaKey: true }), 'diagram')).toBeNull();
    expect(matchDiagramKey(k('N', 'KeyN', { shiftKey: true }), 'diagram')).toBeNull();
    expect(matchDiagramKey(k('Enter', 'Enter', { shiftKey: true }), 'diagram')).toBeNull();
    expect(matchDiagramKey(k('Backspace', 'Backspace', { altKey: true }), 'diagram')).toBeNull();
    expect(matchDiagramKey(k('x', 'KeyX'), 'diagram')).toBeNull();
    // The global table leaves them alone (no double handling).
    for (const key of [k('n', 'KeyN'), k('Delete', 'Delete'), k('F2', 'F2')])
      expect(matchShortcut(key, 'diagram', false)).toBeNull();
  });
  it('Help lists the new diagram keys', () => {
    const keys = shortcutRows(false).map((r) => r.keys);
    expect(keys).toContain('N');
    expect(keys).toContain('Enter / F2');
    expect(keys).toContain('Delete / Backspace');
    expect(keys).toContain('Ctrl+Enter / Esc');
  });
  it('search: Mod+K outside Monaco, / on the diagram', () => {
    const modK = k('k', 'KeyK', { ctrlKey: true });
    for (const zone of ['diagram', 'other', 'input'] as const)
      expect(matchShortcut(modK, zone, false)).toBe('search');
    expect(matchShortcut(modK, 'monaco', false)).toBeNull();
    expect(matchShortcut(k('k', 'KeyK', { metaKey: true }), 'other', true)).toBe('search');
    expect(matchShortcut(k('K', 'KeyK', { ctrlKey: true, shiftKey: true }), 'other', false)).toBe(
      null,
    );
    expect(matchShortcut(k('/', 'Slash'), 'diagram', false)).toBe('search');
    for (const zone of ['monaco', 'input', 'other'] as const)
      expect(matchShortcut(k('/', 'Slash'), zone, false)).toBeNull();
  });
  it('compare: Mod+Alt+D everywhere, by the physical key', () => {
    for (const zone of ['monaco', 'input', 'diagram', 'other'] as const) {
      expect(matchShortcut(k('d', 'KeyD', { ctrlKey: true, altKey: true }), zone, false)).toBe(
        'compare',
      );
      expect(matchShortcut(k('∂', 'KeyD', { metaKey: true, altKey: true }), zone, true)).toBe(
        'compare',
      );
    }
    expect(matchShortcut(k('d', 'KeyD', { ctrlKey: true }), 'other', false)).toBeNull();
  });
  it('detail 1 / 2 / 3 and Esc only on the diagram; Shift+1 stays Fit', () => {
    expect(matchDiagramKey(k('1', 'Digit1'), 'diagram')).toBe('detailNames');
    expect(matchDiagramKey(k('2', 'Digit2'), 'diagram')).toBe('detailKeys');
    expect(matchDiagramKey(k('3', 'Digit3'), 'diagram')).toBe('detailAll');
    expect(matchDiagramKey(k('Escape', 'Escape'), 'diagram')).toBe('escape');
    expect(matchDiagramKey(k('!', 'Digit1', { shiftKey: true }), 'diagram')).toBeNull();
    expect(matchShortcut(k('!', 'Digit1', { shiftKey: true }), 'diagram', false)).toBe('fit');
    for (const zone of ['monaco', 'input', 'other'] as const) {
      expect(matchDiagramKey(k('2', 'Digit2'), zone)).toBeNull();
      expect(matchDiagramKey(k('Escape', 'Escape'), zone)).toBeNull();
    }
    expect(matchShortcut(k('2', 'Digit2'), 'diagram', false)).toBeNull();
  });
  it('Help lists the phase-3 navigation shortcuts', () => {
    const rows = shortcutRows(false);
    const keys = rows.map((r) => r.keys);
    expect(keys).toContain('Ctrl+K / /');
    expect(keys).toContain('Ctrl+Alt+D');
    expect(keys).toContain('1 / 2 / 3');
    expect(keys).toContain('Esc');
    expect(shortcutRows(true).map((r) => r.keys)).toContain('⌘⌥D');
    // Every action is listed once (Help renders rows keyed by action).
    expect(new Set(rows.map((r) => r.action)).size).toBe(rows.length);
  });
});
