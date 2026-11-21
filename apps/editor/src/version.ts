// The editor package is private and never versioned; it ships with the libraries' release, so it
// shows the @relvista/core version. Before the first `changeset version` that is the 0.0.0
// placeholder, and a build deployed from main in that window shows no number rather than 0.0.0.
import { version } from '@relvista/core/package.json';

/** "editor 1.2.0", or just "editor" while the libraries are still at the 0.0.0 placeholder. */
export function editorVersionLabel(v: string = version): string {
  return v === '0.0.0' ? 'editor' : `editor ${v}`;
}
