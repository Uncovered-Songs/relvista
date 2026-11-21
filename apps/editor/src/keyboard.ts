/**
 * Shortcut table and dispatcher (design §4.10). Pure: the App passes key events and the focused
 * element in; undo/redo are routed by focus (Monaco keeps its own text undo).
 */

export type ShortcutAction =
  | 'save'
  | 'saveAs'
  | 'open'
  | 'undo'
  | 'redo'
  | 'autoLayout'
  | 'fit'
  | 'zoomIn'
  | 'zoomOut'
  | 'focusCode'
  | 'focusDiagram'
  | 'help';

export type FocusZone = 'monaco' | 'diagram' | 'input' | 'other';

export interface KeyLike {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function isMacPlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  // `navigator.platform` first: headless and some embedded Chromium builds report a different
  // `userAgentData.platform` than the keyboard they actually deliver.
  return isMacPlatform(nav.platform || nav.userAgentData?.platform || nav.userAgent || '');
}

/** "Mod" = Cmd on macOS, Ctrl elsewhere. Exactly one of them must be down for Mod shortcuts. */
export function hasMod(e: KeyLike, mac: boolean): boolean {
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

export function zoneOf(el: Element | null): FocusZone {
  if (!el) return 'other';
  if (el.closest('.monaco-editor')) return 'monaco';
  if (el.closest('.rv-canvas')) return 'diagram';
  const tag = el.tagName;
  if (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  ) {
    return 'input';
  }
  return 'other';
}

/**
 * The action for a key event in a focus zone, or null to let the browser / Monaco handle it.
 * Mod+S / Mod+Shift+S / Mod+O inside Monaco are bound with `editor.addCommand` instead (Monaco
 * stops the event), but they are matched here too for every other zone.
 */
export function matchShortcut(e: KeyLike, zone: FocusZone, mac: boolean): ShortcutAction | null {
  const mod = hasMod(e, mac);
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && !e.altKey) {
    if (e.code === 'KeyS' || key === 's') return e.shiftKey ? 'saveAs' : 'save';
    if ((e.code === 'KeyO' || key === 'o') && !e.shiftKey) return 'open';
    const isZ = e.code === 'KeyZ' || key === 'z';
    const isY = e.code === 'KeyY' || key === 'y';
    if (isZ || isY) {
      if (zone === 'monaco' || zone === 'input') return null; // text undo stays native
      if (isY) return e.shiftKey ? null : 'redo';
      return e.shiftKey ? 'redo' : 'undo';
    }
  }
  if (mod && e.altKey && !e.shiftKey && e.code === 'KeyL') return 'autoLayout';
  if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    if (e.code === 'Digit1') return 'focusCode';
    if (e.code === 'Digit2') return 'focusDiagram';
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (zone === 'diagram') {
    if (e.shiftKey && (e.code === 'Digit1' || key === '!')) return 'fit';
    if (key === '+' || key === '=') return 'zoomIn';
    if (key === '-' || key === '_') return 'zoomOut';
  }
  if (key === '?' && zone !== 'monaco' && zone !== 'input') return 'help';
  return null;
}

export interface ShortcutRow {
  keys: string;
  action: string;
  where: string;
}

/** Keys as shown in Help (Mod spelled per platform). */
export function shortcutRows(mac: boolean): ShortcutRow[] {
  const mod = mac ? '⌘' : 'Ctrl';
  const alt = mac ? '⌥' : 'Alt';
  const shift = mac ? '⇧' : 'Shift';
  const j = (...k: string[]) => k.join(mac ? '' : '+');
  return [
    { keys: j(mod, 'S'), action: 'Save', where: 'Everywhere' },
    { keys: j(mod, shift, 'S'), action: 'Save as', where: 'Everywhere' },
    { keys: j(mod, 'O'), action: 'Open file', where: 'Everywhere' },
    {
      keys: `${j(mod, 'Z')} / ${j(mod, shift, 'Z')}`,
      action: 'Undo / redo (text in the code editor, else layout)',
      where: 'Everywhere',
    },
    { keys: j(mod, alt, 'L'), action: 'Auto-layout (keeps pinned)', where: 'Everywhere' },
    { keys: j(shift, '1'), action: 'Fit diagram', where: 'Diagram' },
    { keys: '+ / −', action: 'Zoom in / out', where: 'Diagram' },
    { keys: `Arrows (${shift}: fine)`, action: 'Move selected tables', where: 'Diagram' },
    { keys: 'Enter', action: 'Reveal focused table in code', where: 'Diagram' },
    {
      keys: `${j(alt, '1')} / ${j(alt, '2')}`,
      action: 'Focus code / diagram',
      where: 'Everywhere',
    },
    { keys: '?', action: 'This help', where: 'Outside the code editor' },
    { keys: 'F1', action: 'Command palette', where: 'Code editor' },
    { keys: j(mod, 'F'), action: 'Find', where: 'Code editor' },
    {
      keys: 'F12 / ' + j(shift, 'F12'),
      action: 'Go to definition / references',
      where: 'Code editor',
    },
  ];
}
