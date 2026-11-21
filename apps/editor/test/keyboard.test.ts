// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isMacPlatform, matchShortcut, zoneOf, type KeyLike } from '../src/keyboard.js';

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
});
