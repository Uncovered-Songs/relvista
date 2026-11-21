import { detectMac } from '../keyboard.js';

const mac = detectMac();

/** `mod('S')` → "⌘S" on macOS, "Ctrl+S" elsewhere; `mod('S', { shift: true })` → "⇧⌘S" / "Ctrl+Shift+S". */
export function mod(key: string, o: { shift?: boolean; alt?: boolean } = {}): string {
  if (mac) return `${o.alt ? '⌥' : ''}${o.shift ? '⇧' : ''}⌘${key}`;
  return `Ctrl+${o.alt ? 'Alt+' : ''}${o.shift ? 'Shift+' : ''}${key}`;
}
