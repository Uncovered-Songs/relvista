import {
  METRICS,
  columnBadges,
  columnTypeLabel,
  estimateTextWidth,
  tableTitle,
  visibleColumns,
  type Box,
  type Column,
  type ColumnBadge,
  type DetailLevel,
  type Table,
  type TextMeasure,
} from '@relvista/core';
import { memo, type ReactElement } from 'react';
import { contrastText, parseHex, safeColor } from '../theme.js';
import { useColors } from './context.js';
import { baseline, truncate } from './text.js';

export interface TableSvgProps {
  table: Table;
  box: Box;
  detailLevel?: DetailLevel;
  /** Draw at reduced opacity (not part of the current highlight). */
  dimmed?: boolean;
  /** Draw with the highlight border. */
  highlighted?: boolean;
  selected?: boolean;
  /** Column names whose rows get the highlight background. */
  highlightColumns?: ReadonlySet<string> | null;
  /** id of a `<filter>` in scope for the card shadow. */
  shadowFilter?: string | null;
  measure?: TextMeasure;
}

function headerPath(w: number, h: number, r: number, roundBottom: boolean): string {
  const b = roundBottom ? r : 0;
  return (
    `M0 ${r} Q0 0 ${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h - b}` +
    (b ? ` Q${w} ${h} ${w - b} ${h} H${b} Q0 ${h} 0 ${h - b}` : ` H0`) +
    ' Z'
  );
}

/** A column's type as drawn (core's `columnTypeLabel`, which layout measures). */
export const typeLabel: (c: Column) => string = columnTypeLabel;

/** Text of a column row's tooltip. */
export function columnTooltip(c: Column): string {
  const parts = [`${c.name} ${typeLabel(c)}`];
  if (c.pk) parts.push('primary key');
  if (c.isFk) parts.push('foreign key');
  if (c.unique) parts.push('unique');
  if (c.notNull) parts.push('not null');
  if (c.increment) parts.push('increment');
  if (c.default) parts.push(`default: ${String(c.default.value)}`);
  if (c.note) parts.push(`\n${c.note}`);
  return parts.join(' · ').replace(' · \n', '\n');
}

function KeyIcon({ cx, cy, color }: { cx: number; cy: number; color: string }): ReactElement {
  return (
    <g
      transform={`translate(${cx} ${cy})`}
      style={{ stroke: color, fill: 'none' }}
      strokeWidth={1.6}
      strokeLinecap="round"
      data-rv-key="pk"
    >
      <circle cx={-2.5} cy={0} r={3} />
      <path d="M0.5 0 H6.5 M4.5 0 V2.8 M6.5 0 V2.2" />
    </g>
  );
}

function FkIcon({ cx, cy, color }: { cx: number; cy: number; color: string }): ReactElement {
  return (
    <g
      transform={`translate(${cx} ${cy})`}
      style={{ stroke: color, fill: 'none' }}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-rv-key="fk"
    >
      <path d="M-5 0 H4 M1 -3 L4 0 L1 3" />
    </g>
  );
}

function NoteIcon({ x, y, color }: { x: number; y: number; color: string }): ReactElement {
  return (
    <g transform={`translate(${x} ${y})`} style={{ stroke: color, fill: 'none' }} strokeWidth={1.3}>
      <title>has note</title>
      <path d="M-4.5 -5.5 H2 L4.5 -3 V5.5 H-4.5 Z" strokeLinejoin="round" />
      <path d="M-2.5 -1.5 H2.5 M-2.5 1 H2.5 M-2.5 3.5 H1" strokeLinecap="round" />
    </g>
  );
}

/** One table card: header band, column rows, key markers and badges, drawn at `box`. */
export const TableSvg = memo(function TableSvg({
  table,
  box,
  detailLevel = 'all',
  dimmed = false,
  highlighted = false,
  selected = false,
  highlightColumns,
  shadowFilter,
  measure = estimateTextWidth,
}: TableSvgProps): ReactElement {
  const { c, font, mono } = useColors();
  const w = box.width;
  const h = box.height;
  const r = METRICS.cornerRadius;
  const cols = visibleColumns(table, detailLevel);
  const userHeader = safeColor(table.headerColor);
  const headerRgb = parseHex(userHeader);
  const headerFill = userHeader ?? c('headerBg');
  const headerText = headerRgb ? contrastText(headerRgb) : c('headerText');
  const px = METRICS.paddingX;
  const fs = METRICS.fontSize;

  const title = tableTitle(table);
  const noteRoom = table.note ? METRICS.headerNoteIconWidth : 0;
  const titleText = truncate(title, 'tableName', w - px * 2 - noteRoom, measure);
  const schemaPrefix =
    table.schema !== 'public' && titleText.startsWith(`${table.schema}.`) ? table.schema + '.' : '';

  const nameX = px + METRICS.keyMarkerWidth;
  const typeRight = w - px;

  return (
    <g
      className="rv-table"
      data-rv-table={table.id}
      transform={`translate(${box.x} ${box.y})`}
      opacity={dimmed ? 0.28 : undefined}
    >
      <rect
        width={w}
        height={h}
        rx={r}
        ry={r}
        style={{ fill: c('tableBg') }}
        filter={shadowFilter ? `url(#${shadowFilter})` : undefined}
      />
      <path
        d={headerPath(w, METRICS.headerHeight, r, cols.length === 0)}
        style={{ fill: headerFill }}
      />
      <text
        x={px}
        y={baseline(METRICS.headerHeight / 2, fs.tableName)}
        className="rv-table-name"
        style={{
          fill: headerText,
          fontFamily: font,
          fontSize: fs.tableName,
          fontWeight: METRICS.fontWeight.tableName,
        }}
      >
        <title>{table.note ? `${title}\n${table.note}` : title}</title>
        {schemaPrefix ? (
          <>
            <tspan opacity={0.72}>{schemaPrefix}</tspan>
            {titleText.slice(schemaPrefix.length)}
          </>
        ) : (
          titleText
        )}
      </text>
      {table.note ? (
        <NoteIcon x={w - px - 4} y={METRICS.headerHeight / 2} color={headerText} />
      ) : null}

      {cols.map((col, i) => {
        const y0 = METRICS.headerHeight + i * METRICS.rowHeight;
        const cy = y0 + METRICS.rowHeight / 2;
        // Name and type share the row; only when both do not fit is the longer one shortened,
        // the type keeping at least 45% of the room.
        const label = typeLabel(col);
        const colBadges = columnBadges(col);
        const room = typeRight - nameX - METRICS.nameTypeGap;
        const fullName = measure(col.name, 'columnName');
        const fullType = measure(label, 'columnType');
        const maxType =
          fullName + fullType <= room ? fullType : Math.max(room * 0.45, room - fullName);
        const typeText = truncate(label, 'columnType', maxType, measure);
        const typeW = measure(typeText, 'columnType');
        const maxName = room - typeW;
        const nameText = truncate(col.name, 'columnName', maxName, measure);
        const nameEnd = nameX + measure(nameText, 'columnName');
        // Badges sit right-aligned before the type, only where they fit (measureTable reserves
        // their room, so they are only dropped when a saved width is too narrow).
        const B = METRICS.badge;
        const badges: Array<ColumnBadge & { x: number }> = [];
        let bx = typeRight - typeW - B.margin;
        for (const b of colBadges) {
          if (bx - b.width < nameEnd + B.margin) break;
          bx -= b.width;
          badges.push({ ...b, x: bx });
          bx -= B.gap;
        }
        const lit = highlightColumns?.has(col.name) ?? false;
        return (
          <g key={col.name} className="rv-column" data-rv-column={col.name}>
            <title>{columnTooltip(col)}</title>
            {lit ? (
              <rect
                x={0}
                y={y0}
                width={w}
                height={METRICS.rowHeight}
                style={{ fill: c('rowHighlight') }}
              />
            ) : null}
            {i > 0 ? (
              <line x1={0} x2={w} y1={y0} y2={y0} style={{ stroke: c('rowDivider') }} />
            ) : null}
            {col.pk ? (
              <KeyIcon cx={px + 6} cy={cy} color={c('pkMarker')} />
            ) : col.isFk ? (
              <FkIcon cx={px + 6} cy={cy} color={c('fkMarker')} />
            ) : null}
            <text
              x={nameX}
              y={baseline(cy, fs.columnName)}
              style={{
                fill: c('rowText'),
                fontFamily: font,
                fontSize: fs.columnName,
                fontWeight: METRICS.fontWeight.columnName,
              }}
            >
              {nameText}
            </text>
            {badges.map((b) =>
              b.kind === 'note' ? (
                <circle
                  key={b.title}
                  cx={b.x + b.width / 2}
                  cy={cy}
                  r={2.6}
                  style={{ fill: c('noteIndicator') }}
                  data-rv-badge="note"
                />
              ) : (
                <g key={b.title} data-rv-badge={b.title}>
                  <rect
                    x={b.x}
                    y={cy - B.height / 2}
                    width={b.width}
                    height={B.height}
                    rx={3}
                    style={{ fill: c('badgeBg') }}
                  />
                  <text
                    x={b.x + b.width / 2}
                    y={baseline(cy, B.fontSize)}
                    textAnchor="middle"
                    style={{
                      fill: c('badgeText'),
                      fontFamily: font,
                      fontSize: B.fontSize,
                      fontWeight: 600,
                      letterSpacing: 0.3,
                    }}
                  >
                    {b.label}
                  </text>
                </g>
              ),
            )}
            <text
              x={typeRight}
              y={baseline(cy, fs.columnType)}
              textAnchor="end"
              style={{
                fill: c('typeText'),
                fontFamily: mono,
                fontSize: fs.columnType,
                fontWeight: METRICS.fontWeight.columnType,
              }}
            >
              {typeText}
            </text>
          </g>
        );
      })}
      <rect
        className="rv-table-border"
        x={0.5}
        y={0.5}
        width={Math.max(0, w - 1)}
        height={Math.max(0, h - 1)}
        rx={r - 0.5}
        ry={r - 0.5}
        style={{
          fill: 'none',
          stroke: selected || highlighted ? c('selection') : c('tableBorder'),
        }}
        strokeWidth={selected ? 2 : 1}
      />
    </g>
  );
});
