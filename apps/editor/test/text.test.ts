import { describe, expect, it } from 'vitest';
import {
  NotUtf8Error,
  decodeDbml,
  detectEnvelope,
  editorText,
  encodeDbml,
  envelopeLabel,
  normalizeToLf,
  restoreLineEndings,
  saveBytes,
  splitLines,
} from '../src/files/text.js';
import type { EditorFile } from '../src/state/types.js';
import { exampleFiles, rng } from './helpers.js';

const enc = new TextEncoder();
const BOM = [0xef, 0xbb, 0xbf];

function open(bytes: Uint8Array): Pick<EditorFile, 'disk' | 'envelope'> & { lf: string } {
  const { text, envelope } = decodeDbml(bytes);
  return { disk: { bytes, text }, envelope, lf: normalizeToLf(text) };
}

const VARIANTS: Record<string, (t: string) => Uint8Array> = {
  'as is': (t) => enc.encode(t),
  CRLF: (t) => enc.encode(normalizeToLf(t).replaceAll('\n', '\r\n')),
  BOM: (t) => new Uint8Array([...BOM, ...enc.encode(t)]),
  'BOM+CRLF': (t) =>
    new Uint8Array([...BOM, ...enc.encode(normalizeToLf(t).replaceAll('\n', '\r\n'))]),
  mixed: (t) => {
    let i = 0;
    return enc.encode(normalizeToLf(t).replace(/\n/g, () => ['\n', '\r\n', '\r'][i++ % 3]!));
  },
  CR: (t) => enc.encode(normalizeToLf(t).replaceAll('\n', '\r')),
  'no final newline': (t) => enc.encode(t.replace(/[\r\n]+$/, '')),
};

describe('decodeDbml', () => {
  it('decodes UTF-8 and records a BOM', () => {
    const r = decodeDbml(new Uint8Array([...BOM, ...enc.encode('Table a {}\n')]));
    expect(r.text).toBe('Table a {}\n');
    expect(r.envelope).toEqual({ bom: true, eol: '\n', mixed: false });
  });
  it('rejects UTF-16 BOMs and invalid UTF-8', () => {
    expect(() => decodeDbml(new Uint8Array([0xff, 0xfe, 0x54, 0x00]))).toThrow(NotUtf8Error);
    expect(() => decodeDbml(new Uint8Array([0xfe, 0xff, 0x00, 0x54]))).toThrow(NotUtf8Error);
    expect(() => decodeDbml(new Uint8Array([0x54, 0xc3, 0x28]))).toThrow(NotUtf8Error);
  });
  it('keeps a second U+FEFF', () => {
    const r = decodeDbml(new Uint8Array([...BOM, ...BOM, 0x41]));
    expect(r.text).toBe('﻿A');
  });
});

describe('a U+FEFF after the BOM (Monaco hides one leading U+FEFF)', () => {
  const bytes = new Uint8Array([...BOM, ...BOM, ...enc.encode('Table a {\r\n  id int\r\n}\r\n')]);
  const f = open(bytes);
  const held = editorText(f.disk!.text); // what the Monaco model holds
  it('is clean as opened and saves byte for byte', () => {
    expect(held).toBe('Table a {\n  id int\n}\n');
    expect(saveBytes(f, held)).toBe(bytes);
  });
  it('keeps the extra U+FEFF after an edit', () => {
    const out = saveBytes(f, held.replace('id int', 'id bigint'));
    expect([...out.slice(0, 7)]).toEqual([...BOM, ...BOM, 0x54]);
    expect(new TextDecoder().decode(out.slice(6))).toBe('Table a {\r\n  id bigint\r\n}\r\n');
  });
  it('leaves other text alone', () => {
    expect(editorText('a\r\nb')).toBe('a\nb');
    expect(editorText('a\uFEFFb')).toBe('a\uFEFFb');
  });
});

describe('detectEnvelope', () => {
  it.each([
    ['a\nb\n', '\n', false],
    ['a\r\nb\r\n', '\r\n', false],
    ['a\rb\r', '\r', false],
    ['a\r\nb\nc\r\n', '\r\n', true],
    ['a\nb\r\nc\n', '\n', true],
    ['abc', '\n', false],
    ['', '\n', false],
  ])('%j → %j mixed=%s', (text, eol, mixed) => {
    expect(detectEnvelope(text, false)).toEqual({ bom: false, eol, mixed });
  });
  it('labels', () => {
    expect(envelopeLabel({ bom: true, eol: '\r\n', mixed: false })).toBe('UTF-8 with BOM · CRLF');
    expect(envelopeLabel({ bom: false, eol: '\n', mixed: true })).toBe('UTF-8 · Mixed');
  });
});

describe('splitLines', () => {
  it('splits keeping terminators', () => {
    expect(splitLines('a\r\nb\rc\nd')).toEqual({
      lines: ['a', 'b', 'c', 'd'],
      eols: ['\r\n', '\r', '\n', ''],
    });
  });
});

describe('saveBytes identity (gate)', () => {
  const examples = exampleFiles();
  it('found the examples', () => expect(examples.length).toBeGreaterThanOrEqual(18));
  for (const ex of examples) {
    for (const [variant, make] of Object.entries(VARIANTS)) {
      it(`${ex.name} × ${variant}`, () => {
        const bytes = make(ex.text);
        const f = open(bytes);
        expect(saveBytes(f, f.lf)).toEqual(bytes);
        // Edit then undo: same LF text → original bytes.
        expect(saveBytes(f, `${f.lf}x`.slice(0, -1))).toEqual(bytes);
      });
    }
  }
});

describe('saveBytes after edits', () => {
  it('uniform CRLF + BOM: edited text uses CRLF and keeps the BOM', () => {
    const f = open(new Uint8Array([...BOM, ...enc.encode('a\r\nb\r\n')]));
    const out = saveBytes(f, 'a\nB\nc\n');
    expect(out).toEqual(new Uint8Array([...BOM, ...enc.encode('a\r\nB\r\nc\r\n')]));
  });
  it('untitled (no disk) writes LF without BOM', () => {
    const out = saveBytes({ disk: null, envelope: { bom: false, eol: '\n', mixed: false } }, 'x\n');
    expect(new TextDecoder().decode(out)).toBe('x\n');
  });
  it('editing one line of a mixed file changes only that line', () => {
    const original = 'one\r\ntwo\nthree\rfour\r\nfive\n';
    const f = open(enc.encode(original));
    expect(f.envelope.mixed).toBe(true);
    const edited = f.lf.replace('three', 'THREE');
    const text = new TextDecoder().decode(saveBytes(f, edited));
    // Dominant terminator: LF and CRLF tie at 2, LF wins; the changed line gets it.
    expect(f.envelope.eol).toBe('\n');
    expect(text).toBe('one\r\ntwo\nTHREE\nfour\r\nfive\n');
    const a = splitLines(original);
    const b = splitLines(text);
    for (const i of [0, 1, 3, 4]) {
      expect(b.lines[i]).toBe(a.lines[i]);
      expect(b.eols[i]).toBe(a.eols[i]);
    }
  });
  it('insertions get the dominant terminator, untouched lines keep theirs', () => {
    const original = 'a\r\nb\r\nc\nd\r\n';
    const f = open(enc.encode(original));
    const text = new TextDecoder().decode(saveBytes(f, 'a\nb\nnew\nc\nd\n'));
    expect(text).toBe('a\r\nb\r\nnew\r\nc\nd\r\n');
  });
  it('removing the final newline follows the edit', () => {
    expect(restoreLineEndings('a\rb\r', 'a\nb', '\r')).toBe('a\rb');
    expect(restoreLineEndings('a\rb', 'a\nb\n', '\r')).toBe('a\rb\r');
  });

  it('500 random mixed files with random edits keep every untouched line terminator', () => {
    const rand = rng(20261120);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    const words = ['Table', 'users', '{', '}', 'id', 'int', '[pk]', 'Ref:', '>', "'note'", ''];
    for (let n = 0; n < 500; n++) {
      const count = 1 + Math.floor(rand() * 40);
      const lines: string[] = [];
      const eols: string[] = [];
      for (let i = 0; i < count; i++) {
        lines.push(`${pick(words)} ${pick(words)} ${i}`.trim());
        eols.push(i === count - 1 && rand() < 0.3 ? '' : pick(['\n', '\r\n', '\r']));
      }
      const original = lines.map((l, i) => l + eols[i]).join('');
      const f = open(new Uint8Array([...(rand() < 0.3 ? BOM : []), ...enc.encode(original)]));
      // Random edits on the LF text: change, insert, delete lines.
      const edited = f.lf.split('\n');
      const touched = new Set<string>();
      const edits = 1 + Math.floor(rand() * 4);
      for (let e = 0; e < edits; e++) {
        const at = Math.floor(rand() * edited.length);
        const op = rand();
        if (op < 0.4) {
          edited[at] = `changed ${n} ${e}`;
          touched.add(edited[at]!);
        } else if (op < 0.7) {
          edited.splice(at, 0, `inserted ${n} ${e}`);
          touched.add(`inserted ${n} ${e}`);
        } else if (edited.length > 1) {
          edited.splice(at, 1);
        }
      }
      const editedLf = edited.join('\n');
      const out = saveBytes(f, editedLf);
      const decoded = decodeDbml(out);
      expect(decoded.envelope.bom).toBe(f.envelope.bom);
      expect(normalizeToLf(decoded.text)).toBe(editedLf);
      // Every output line that is not new and is a unique original line keeps its terminator.
      const a = splitLines(f.disk!.text);
      const b = splitLines(decoded.text);
      const counts = new Map<string, number>();
      for (const l of a.lines) counts.set(l, (counts.get(l) ?? 0) + 1);
      b.lines.forEach((line, i) => {
        if (touched.has(line) || counts.get(line) !== 1) return;
        if (i === b.lines.length - 1) return; // last segment has no terminator by construction
        const j = a.lines.indexOf(line);
        if (a.eols[j] === '') return; // was the unterminated last line
        expect(b.eols[i]).toBe(a.eols[j]);
      });
    }
  });
});

describe('encodeDbml', () => {
  it('adds the BOM when asked', () => {
    expect([...encodeDbml('A', true)]).toEqual([...BOM, 0x41]);
    expect([...encodeDbml('A', false)]).toEqual([0x41]);
  });
});
