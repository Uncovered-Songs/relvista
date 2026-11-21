/**
 * The sticky-note text editor (design phase3 §6.4): a `<textarea>` laid exactly over the note as
 * drawn (`getNodeClientRect`), in the note's font, size and colours at the current zoom, growing
 * with its text. Esc cancels; Mod+Enter or leaving it commits through `setStickyNoteText` (one
 * undo stop in the code pane).
 */
import { METRICS, estimateTextWidth } from '@relvista/core';
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { detectMac, hasMod } from '../keyboard.js';
import { store, useEditor } from '../state/store.js';
import { refocusNode } from './NodeMenu.js';
import './editing.css';

const MAC = detectMac();

let measureCtx: CanvasRenderingContext2D | null | undefined;

/**
 * Letter spacing (px at zoom 1) that makes `text` in `fontFamily` as wide as core's
 * `estimateTextWidth`, which the drawn note wraps with: the textarea then breaks its lines where
 * the note will, so committing does not reflow the text. 0 without a canvas.
 */
export function noteLetterSpacing(text: string, fontFamily: string): number {
  const sample = text.replace(/\s+/g, ' ').trim();
  if (!sample) return 0;
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return 0;
  measureCtx.font = `400 ${METRICS.fontSize.noteText}px ${fontFamily}`;
  const real = measureCtx.measureText(sample).width;
  if (!(real > 0)) return 0;
  const spacing = (estimateTextWidth(sample, 'noteText') - real) / Array.from(sample).length;
  return Math.max(-1, Math.min(2, spacing));
}

interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
  zoom: number;
  background: string;
  color: string;
}

/** The note's box and colours as drawn now, or null while it is not rendered. */
function frameOf(id: string): Frame | null {
  const rect = store.canvas?.getNodeClientRect(id);
  if (!rect || rect.width === 0) return null;
  const node = [...document.querySelectorAll<HTMLElement>('.rv-canvas .react-flow__node')].find(
    (n) => n.getAttribute('data-id') === id,
  );
  const shape = node?.querySelector<SVGElement>('.rv-note rect');
  const text = node?.querySelector<SVGElement>('.rv-note text');
  const zoom = store.canvas?.getViewport().zoom ?? 1;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    zoom,
    background: shape ? getComputedStyle(shape).fill : '',
    color: text ? getComputedStyle(text).fill : '',
  };
}

const same = (a: Frame | null, b: Frame | null) =>
  !!a &&
  !!b &&
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.top - b.top) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5 &&
  a.zoom === b.zoom &&
  a.background === b.background;

export function NoteEditor(props: { id: string; fresh: boolean }): ReactElement | null {
  const { id, fresh } = props;
  const note = useEditor((s) => s.compile.model?.stickyNotes.find((n) => n.id === id) ?? null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [text, setText] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const original = useRef<string | null>(null);

  // The note's text when editing starts (a new note: once it has compiled).
  useEffect(() => {
    if (note && original.current === null) {
      original.current = note.content;
      setText(note.content);
    }
  }, [note]);

  // Follows the note while the canvas pans, zooms or re-lays out; gives up when it never shows.
  useEffect(() => {
    let raf = 0;
    let last: Frame | null = null;
    const started = performance.now();
    const tick = () => {
      const f = frameOf(id);
      if (f && !same(f, last)) {
        last = f;
        setFrame(f);
      }
      if (!f && !last && performance.now() - started > 4000) {
        store.stopNoteEdit();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [id]);

  const ready = frame !== null && text !== null;
  useLayoutEffect(() => {
    const el = area.current;
    if (!ready || !el || document.activeElement === el) return;
    el.focus({ preventScroll: true });
    if (fresh) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [ready, fresh]);

  // Wraps like the drawn note (see noteLetterSpacing); auto-height: never smaller than the note,
  // grows with the text.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || !frame) return;
    const spacing = noteLetterSpacing(el.value, getComputedStyle(el).fontFamily);
    el.style.letterSpacing = `${spacing * frame.zoom}px`;
    el.style.height = '0px';
    el.style.height = `${Math.max(frame.height, el.scrollHeight)}px`;
  }, [text, frame]);

  if (!ready) return null;

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const value = area.current?.value ?? text;
    if (commit && value !== original.current) store.setNoteText(id, value);
    store.stopNoteEdit();
    refocusNode(id);
  };

  const z = frame.zoom;
  return (
    <textarea
      ref={area}
      className="ed-noteeditor"
      aria-label={`Text of the note ${note?.name ?? id.replace(/^note:/, '')}`}
      aria-describedby="ed-noteeditor-help"
      value={text}
      spellCheck
      style={{
        left: frame.left,
        top: frame.top,
        width: frame.width,
        minHeight: frame.height,
        // The text box of the drawn note: its padding inside the 2 px focus border.
        padding: `${Math.max(0, METRICS.notePadding * z - 2)}px`,
        fontSize: `${METRICS.fontSize.noteText * z}px`,
        lineHeight: `${METRICS.noteLineHeight * z}px`,
        borderRadius: `${METRICS.cornerRadius * z}px`,
        ...(frame.background ? { background: frame.background } : {}),
        ...(frame.color ? { color: frame.color } : {}),
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        } else if (e.key === 'Enter' && hasMod(e, MAC)) {
          e.preventDefault();
          e.stopPropagation();
          finish(true);
        }
      }}
    />
  );
}

/** Screen-reader hint for the note editor, rendered once next to it. */
export function NoteEditorHelp(): ReactElement {
  return (
    <span id="ed-noteeditor-help" className="ed-visually-hidden">
      {`${MAC ? '⌘' : 'Ctrl'}+Enter saves the note, Escape cancels.`}
    </span>
  );
}
