import {
  METRICS,
  estimateTextWidth,
  wrapNoteText,
  type Box,
  type StickyNote,
  type TextMeasure,
} from '@relvista/core';
import { memo, type ReactElement } from 'react';
import { contrastText, mix, parseHex, safeColor, toHex } from '../theme.js';
import { useColors } from './context.js';
import { baseline } from './text.js';

export interface NoteSvgProps {
  note: StickyNote;
  box: Box;
  dimmed?: boolean;
  shadowFilter?: string | null;
  measure?: TextMeasure;
}

/** A sticky note: a rounded card (yellowish, or the note's colour) with its wrapped text. */
export const NoteSvg = memo(function NoteSvg({
  note,
  box,
  dimmed,
  shadowFilter,
  measure = estimateTextWidth,
}: NoteSvgProps): ReactElement {
  const { c } = useColors();
  const user = safeColor(note.color);
  const rgb = parseHex(user);
  const fill = user ?? c('noteBg');
  const stroke = rgb ? toHex(mix(rgb, { r: 0, g: 0, b: 0 }, 0.15)) : c('noteBorder');
  const text = rgb ? contrastText(rgb) : c('noteText');
  const lines = wrapNoteText(note.content, measure);
  const fs = METRICS.fontSize.noteText;
  const p = METRICS.notePadding;
  return (
    <g
      className="rv-note"
      data-rv-note={note.id}
      transform={`translate(${box.x} ${box.y})`}
      opacity={dimmed ? 0.28 : undefined}
    >
      <title>{note.name}</title>
      <rect
        width={box.width}
        height={box.height}
        rx={METRICS.cornerRadius}
        ry={METRICS.cornerRadius}
        style={{ fill, stroke }}
        filter={shadowFilter ? `url(#${shadowFilter})` : undefined}
      />
      <text
        style={{
          fill: text,
          fontFamily: METRICS.fontFamily,
          fontSize: fs,
          fontWeight: METRICS.fontWeight.noteText,
        }}
      >
        {lines.map((line, i) => (
          <tspan
            key={i}
            x={p}
            y={baseline(p + i * METRICS.noteLineHeight + METRICS.noteLineHeight / 2, fs)}
          >
            {line || ' '}
          </tspan>
        ))}
      </text>
    </g>
  );
});
