import { Filepath } from '@dbml/parse';
import type { SourcePosition, SourceSpan } from './types.js';

const BOM = '﻿';

interface SourceFile {
  key: string;
  /** Text handed to the parser (BOM stripped). */
  text: string;
  /** The text as given; caller positions index this string. */
  original: string;
  /** 1 when a BOM was stripped: parser offset + shift = offset in the original string. */
  offsetShift: number;
  lineStarts: number[] | undefined;
}

/** Normalises caller file keys to parser filepaths and converts parser offsets back to caller positions. */
export class SourceMap {
  private readonly byAbsolute = new Map<string, SourceFile>();

  /**
   * Registers a file. Returns `null`, or, when another key already normalises to the same absolute
   * path, that key (the file is then not registered).
   */
  add(key: string, source: string): string | null {
    const absolute = toAbsolute(key);
    const existing = this.byAbsolute.get(absolute);
    if (existing) return existing.key;
    const hasBom = source.startsWith(BOM);
    this.byAbsolute.set(absolute, {
      key,
      text: hasBom ? source.slice(1) : source,
      original: source,
      offsetShift: hasBom ? 1 : 0,
      lineStarts: undefined,
    });
    return null;
  }

  /** Parser-facing sources: absolute path → text. */
  parserFiles(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [absolute, file] of this.byAbsolute) out[absolute] = file.text;
    return out;
  }

  has(absolute: string): boolean {
    return this.byAbsolute.has(absolute);
  }

  keyOf(absolute: string): string {
    return this.byAbsolute.get(absolute)?.key ?? absolute;
  }

  /**
   * Converts a parser offset (in the BOM-stripped text) to a caller position. Line, column and
   * offset all refer to the original string, so with a BOM the first line's columns count it.
   */
  position(absolute: string, parserOffset: number): SourcePosition {
    const file = this.byAbsolute.get(absolute);
    if (!file) return { line: 1, column: 1, offset: parserOffset };
    const offset = parserOffset + file.offsetShift;
    file.lineStarts ??= computeLineStarts(file.original);
    const starts = file.lineStarts;
    // Binary search for the last line start <= offset.
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    const lineStart = starts[lo] ?? 0;
    return { line: lo + 1, column: offset - lineStart + 1, offset };
  }

  span(absolute: string, start: number, end: number): SourceSpan {
    return {
      file: this.keyOf(absolute),
      start: this.position(absolute, start),
      end: this.position(absolute, end),
    };
  }
}

export function toAbsolute(key: string): string {
  const withSlash = key.startsWith('/') ? key : `/${key}`;
  return Filepath.from(withSlash).absolute;
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}
