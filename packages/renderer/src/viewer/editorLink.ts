import type { CompileInput } from '@relvista/core';

/** The DBML text an editor link carries: the source, or the entry file of a multi-file input. */
export function entrySource(source: CompileInput): string {
  return typeof source === 'string' ? source : (source.files[source.entry] ?? '');
}

/** `editorUrl#dbml=<encoded DBML>`; any hash already on `editorUrl` is replaced. */
export function editorLink(editorUrl: string, source: CompileInput): string {
  const base = editorUrl.replace(/#.*$/, '');
  return `${base}#dbml=${encodeURIComponent(entrySource(source))}`;
}
