import type { CompileInput } from '@relvista/core';

export { createEditorLink } from './codec.js';

/** The DBML text an editor link carries: the source, or the entry file of a multi-file input. */
export function entrySource(source: CompileInput): string {
  return typeof source === 'string' ? source : (source.files[source.entry] ?? '');
}
