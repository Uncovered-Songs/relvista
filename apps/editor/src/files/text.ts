/**
 * Byte-exact DBML file handling (decision 0004, "Save semantics: bytes, not text"). Pure.
 *
 * Monaco always holds text without BOM and, for our purposes, with '\n' terminators
 * (`getValue(EndOfLinePreference.LF)`). Everything that makes the file on disk different from that
 * (BOM, CRLF, lone CR, a mix) lives in the `TextEnvelope` and the original bytes, and is put back
 * when saving.
 */
import type { EditorFile, Eol, TextEnvelope } from '../state/types.js';
import { diffLines } from './lineDiff.js';

export interface DecodedText {
  text: string;
  envelope: TextEnvelope;
}

export class NotUtf8Error extends Error {
  constructor(message = 'relvista only opens UTF-8 files') {
    super(message);
    this.name = 'NotUtf8Error';
  }
}

const BOM = '﻿';

/** Decodes UTF-8 (fatal), strips and records a BOM. Rejects UTF-16 BOMs and invalid UTF-8. */
export function decodeDbml(bytes: Uint8Array): DecodedText {
  if (
    bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
  ) {
    throw new NotUtf8Error();
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new NotUtf8Error();
  }
  const bom = text.startsWith(BOM);
  if (bom) text = text.slice(1);
  return { text, envelope: detectEnvelope(text, bom) };
}

/** Counts terminators: CRLF, lone LF, lone CR. Dominant wins (ties: LF, then CRLF, then CR). */
export function detectEnvelope(textWithoutBom: string, bom: boolean): TextEnvelope {
  let lf = 0;
  let crlf = 0;
  let cr = 0;
  const s = textWithoutBom;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 13) {
      if (s.charCodeAt(i + 1) === 10) {
        crlf++;
        i++;
      } else cr++;
    } else if (c === 10) lf++;
  }
  const kinds = (lf > 0 ? 1 : 0) + (crlf > 0 ? 1 : 0) + (cr > 0 ? 1 : 0);
  let eol: Eol = '\n';
  if (crlf > lf && crlf >= cr) eol = '\r\n';
  else if (cr > lf && cr > crlf) eol = '\r';
  return { bom, eol, mixed: kinds > 1 };
}

/**
 * The disk text as the editor holds it: '\n' terminators and, when the text (after the BOM) starts
 * with another U+FEFF, without it — Monaco drops one leading U+FEFF when it creates a model.
 */
export function editorText(diskText: string): string {
  return normalizeToLf(diskText.startsWith(BOM) ? diskText.slice(1) : diskText);
}

/** Any terminator → '\n'. */
export function normalizeToLf(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Splits into lines and their terminators ('' for the last line without one). */
export function splitLines(text: string): { lines: string[]; eols: string[] } {
  const lines: string[] = [];
  const eols: string[] = [];
  const re = /\r\n|\r|\n/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    lines.push(text.slice(last, m.index));
    eols.push(m[0]);
    last = m.index + m[0].length;
  }
  lines.push(text.slice(last));
  eols.push('');
  return { lines, eols };
}

/**
 * `edited` uses '\n' only (Monaco getValue(EndOfLinePreference.LF)). Lines unchanged relative to
 * `original` keep their original terminator; inserted/changed lines get `eol`. Whether the text
 * ends with a terminator follows `edited`.
 */
export function restoreLineEndings(original: string, edited: string, eol: Eol): string {
  const a = splitLines(original);
  const bLines = edited.split('\n');
  const matched = new Map<number, number>();
  for (const { aIndex, bIndex } of diffLines(a.lines, bLines)) matched.set(bIndex, aIndex);
  let out = '';
  for (let i = 0; i < bLines.length; i++) {
    out += bLines[i];
    if (i === bLines.length - 1) break; // last segment: no terminator after it
    const aIndex = matched.get(i);
    const origEol = aIndex === undefined ? '' : a.eols[aIndex]!;
    out += origEol !== '' ? origEol : eol;
  }
  return out;
}

/** BOM (when asked) + UTF-8. */
export function encodeDbml(text: string, bom: boolean): Uint8Array {
  return new TextEncoder().encode(bom ? BOM + text : text);
}

/** Bytes to write for a file whose current Monaco text (LF) is `editedLf`. */
export function saveBytes(
  file: Pick<EditorFile, 'disk' | 'envelope'>,
  editedLf: string,
): Uint8Array {
  const { disk, envelope } = file;
  if (disk && editedLf === editorText(disk.text)) return disk.bytes;
  // A U+FEFF after the BOM is invisible in the editor (see editorText) and kept on save.
  const lead = disk?.text.startsWith(BOM) ? BOM : '';
  if (!envelope.mixed || !disk) {
    return encodeDbml(
      lead + (envelope.eol === '\n' ? editedLf : editedLf.replaceAll('\n', envelope.eol)),
      envelope.bom,
    );
  }
  const original = lead ? disk.text.slice(1) : disk.text;
  return encodeDbml(lead + restoreLineEndings(original, editedLf, envelope.eol), envelope.bom);
}

/** Human label of an envelope for the status bar: `UTF-8 · LF`, `UTF-8 with BOM · Mixed`. */
export function envelopeLabel(envelope: TextEnvelope): string {
  const enc = envelope.bom ? 'UTF-8 with BOM' : 'UTF-8';
  const eol = envelope.mixed
    ? 'Mixed'
    : envelope.eol === '\r\n'
      ? 'CRLF'
      : envelope.eol === '\r'
        ? 'CR'
        : 'LF';
  return `${enc} · ${eol}`;
}

export const NEW_FILE_ENVELOPE: TextEnvelope = { bom: false, eol: '\n', mixed: false };
