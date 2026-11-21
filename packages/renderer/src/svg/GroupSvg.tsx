import { METRICS, estimateTextWidth, type Box, type TableGroup } from '@relvista/core';
import { memo, type ReactElement } from 'react';
import { groupColors, safeColor } from '../theme.js';
import { useColors } from './context.js';
import { baseline, truncate } from './text.js';

export interface GroupSvgProps {
  group: TableGroup;
  box: Box;
  dimmed?: boolean;
}

/** A TableGroup's tinted rectangle with its name in the top band. */
export const GroupSvg = memo(function GroupSvg({
  group,
  box,
  dimmed,
}: GroupSvgProps): ReactElement {
  const { c, value, font } = useColors();
  const user = safeColor(group.color);
  // The default colour stays a CSS variable (themable); a user colour is adjusted to the canvas.
  const def = c('groupDefault');
  const { fill, stroke, text } = user
    ? groupColors(user, value('canvasBg'))
    : { fill: def, stroke: def, text: def };
  const r = METRICS.cornerRadius + 4;
  const fs = METRICS.fontSize.tableName;
  const label = truncate(
    group.name,
    'tableName',
    box.width - METRICS.groupPadding,
    estimateTextWidth,
  );
  return (
    <g
      className="rv-group"
      data-rv-group={group.id}
      transform={`translate(${box.x} ${box.y})`}
      opacity={dimmed ? 0.45 : undefined}
    >
      <title>{group.note ? `${group.name}\n${group.note}` : group.name}</title>
      <rect
        width={box.width}
        height={box.height}
        rx={r}
        ry={r}
        style={{ fill, stroke }}
        fillOpacity={0.07}
        strokeOpacity={0.5}
        strokeWidth={1.2}
      />
      <path
        d={`M0 ${r} Q0 0 ${r} 0 H${box.width - r} Q${box.width} 0 ${box.width} ${r} V${METRICS.groupHeaderHeight} H0 Z`}
        style={{ fill }}
        fillOpacity={0.14}
      />
      <text
        x={METRICS.groupPadding / 2 + 2}
        y={baseline(METRICS.groupHeaderHeight / 2, fs)}
        style={{
          fill: text,
          fontFamily: font,
          fontSize: fs,
          fontWeight: METRICS.fontWeight.tableName,
        }}
      >
        {label}
      </text>
    </g>
  );
});
