import type { CompileInputFiles } from '@relvista/core';

/** Text of the Source tab: the DBML, or every file of a multi-file project (entry first). */
export function sourceText(value: string | CompileInputFiles): string {
  if (typeof value === 'string') return value;
  const names = Object.keys(value.files);
  if (names.length <= 1) return value.files[value.entry] ?? '';
  const ordered = [value.entry, ...names.filter((n) => n !== value.entry).sort()];
  return ordered
    .filter((n) => value.files[n] !== undefined)
    .map((n) => `// ${n}\n${value.files[n]!.replace(/\s+$/, '')}\n`)
    .join('\n');
}
