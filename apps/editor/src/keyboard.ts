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
  | 'help'
  | 'search'
  | 'compare';

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

/**
 * Where focus is. A text field counts as 'input' even inside the diagram (the sticky-note editor,
 * a filter field), so single-key diagram shortcuts never fire while typing.
 */
export function zoneOf(el: Element | null): FocusZone {
  if (!el) return 'other';
  if (el.closest('.monaco-editor')) return 'monaco';
  const tag = el.tagName;
  if (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  ) {
    return 'input';
  }
  if (el.closest('.rv-canvas')) return 'diagram';
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
  // Compare… everywhere (Alt changes `key` on macOS: ⌥D is '∂', so the physical key decides).
  if (mod && e.altKey && !e.shiftKey && e.code === 'KeyD') return 'compare';
  // Search: Mod+K anywhere but Monaco (Monaco's own Mod+K chords stay its own).
  if (mod && !e.altKey && !e.shiftKey && (e.code === 'KeyK' || key === 'k'))
    return zone === 'monaco' ? null : 'search';
  if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    if (e.code === 'Digit1') return 'focusCode';
    if (e.code === 'Digit2') return 'focusDiagram';
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (zone === 'diagram') {
    if (e.shiftKey && (e.code === 'Digit1' || key === '!')) return 'fit';
    if (key === '+' || key === '=') return 'zoomIn';
    if (key === '-' || key === '_') return 'zoomOut';
    if (key === '/') return 'search';
  }
  if (key === '?' && zone !== 'monaco' && zone !== 'input') return 'help';
  return null;
}

/** Single-key actions of the diagram (design phase3 §6.13), handled by the diagram pane. */
export type DiagramKeyAction =
  | 'newNote'
  | 'editNote'
  | 'deleteSelection'
  | 'detailNames'
  | 'detailKeys'
  | 'detailAll'
  | 'escape';

/**
 * The diagram action for a key, or null. Only with the diagram focused and no modifier (Shift is
 * allowed for nothing here): never inside Monaco, a text field, a menu or a dialog. 'editNote'
 * applies when a sticky note is focused or selected (the pane checks; Enter on a table keeps
 * revealing it in code).
 */
export function matchDiagramKey(e: KeyLike, zone: FocusZone): DiagramKeyAction | null {
  if (zone !== 'diagram') return null;
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
  if (e.code === 'KeyN' || e.key === 'n' || e.key === 'N') return 'newNote';
  if (e.key === 'Enter' || e.key === 'F2') return 'editNote';
  if (e.key === 'Delete' || e.key === 'Backspace') return 'deleteSelection';
  if (e.code === 'Digit1' || e.key === '1') return 'detailNames';
  if (e.code === 'Digit2' || e.key === '2') return 'detailKeys';
  if (e.code === 'Digit3' || e.key === '3') return 'detailAll';
  if (e.key === 'Escape') return 'escape';
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
    { keys: j(mod, shift, 'S'), action: 'Save as (a folder: Save folder as)', where: 'Everywhere' },
    { keys: j(mod, 'O'), action: 'Open file', where: 'Everywhere' },
    {
      keys: `${j(mod, 'Z')} / ${j(mod, shift, 'Z')}`,
      action: 'Undo / redo (text in the code editor, else layout)',
      where: 'Everywhere',
    },
    { keys: j(mod, alt, 'L'), action: 'Auto-layout (keeps pinned)', where: 'Everywhere' },
    {
      keys: `${j(mod, 'K')} / /`,
      action: 'Search tables, columns, views (and paths)',
      where: 'Outside the code editor (/ on the diagram)',
    },
    { keys: j(mod, alt, 'D'), action: 'Compare with another version…', where: 'Everywhere' },
    { keys: j(shift, '1'), action: 'Fit diagram', where: 'Diagram' },
    { keys: '1 / 2 / 3', action: 'Detail: names / keys / all columns', where: 'Diagram' },
    { keys: '+ / −', action: 'Zoom in / out', where: 'Diagram' },
    { keys: `Arrows (${shift}: fine)`, action: 'Move selected tables', where: 'Diagram' },
    { keys: 'Enter', action: 'Reveal focused table in code', where: 'Diagram' },
    { keys: 'N', action: 'New sticky note (at the pointer)', where: 'Diagram' },
    { keys: 'Enter / F2', action: 'Edit the selected sticky note', where: 'Diagram' },
    {
      keys: `${j(mod, 'Enter')} / Esc`,
      action: 'Finish / cancel editing a sticky note',
      where: 'Note editor',
    },
    {
      keys: 'Delete / Backspace',
      action: `Delete selected sticky notes (${j(mod, 'Z')} on the diagram restores the layout, in the code the text)`,
      where: 'Diagram',
    },
    {
      keys: 'Esc',
      action: 'Close search, then clear the highlight, exit focus, exit compare',
      where: 'Diagram',
    },
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
