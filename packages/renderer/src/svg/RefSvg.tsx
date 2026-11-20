import type { Ref, RefEndpoint } from '@relvista/core';
import { memo, type ReactElement } from 'react';
import { safeColor } from '../theme.js';
import { useColors } from './context.js';
import { round, type RefRoute, type RouteEnd } from './routing.js';

export type RefState = 'normal' | 'highlight' | 'dim';

export interface RefSvgProps {
  refModel: Ref;
  route: RefRoute;
  state?: RefState;
}

/** Text describing a ref, used as its tooltip. */
export function refLabel(ref: Ref): string {
  const end = (e: RefEndpoint) =>
    `${e.tableId}.${e.columns.length > 1 ? `(${e.columns.join(', ')})` : (e.columns[0] ?? '')}`;
  const parts = [`${end(ref.from)} ${ref.relation} ${end(ref.to)}`];
  if (ref.name) parts.unshift(ref.name + ':');
  if (ref.onDelete) parts.push(`delete: ${ref.onDelete}`);
  if (ref.onUpdate) parts.push(`update: ${ref.onUpdate}`);
  if (ref.inactive) parts.push('(inactive)');
  let s = parts.join(' ');
  if (ref.note) s += `\n${ref.note}`;
  return s;
}

/**
 * Crow's-foot marker for one ref end, drawn in local coordinates where the origin is on the table
 * edge and +x points away from the table: one = bar, many = crow's foot, optional = circle.
 */
export function CardinalityMarker({
  end,
  endpoint,
  stroke,
  bg,
  width,
}: {
  end: RouteEnd;
  endpoint: RefEndpoint;
  stroke: string;
  bg: string;
  width: number;
}): ReactElement {
  const many = endpoint.cardinality === 'many';
  const d = many ? 'M13 0 L0 -6.5 M13 0 L0 6.5 M13 0 L0 0' : 'M8 -6 V6';
  const circleX = many ? 18 : 13.5;
  return (
    <g
      className="rv-marker"
      data-rv-marker={many ? 'many' : 'one'}
      data-rv-optional={endpoint.optional ? 'true' : undefined}
      transform={`translate(${round(end.x)} ${round(end.y)}) rotate(${round(end.angle)})`}
      style={{ stroke, fill: 'none' }}
      strokeWidth={width}
      strokeLinecap="round"
    >
      <path d={d} />
      {endpoint.optional ? <circle cx={circleX} cy={0} r={3.6} style={{ fill: bg }} /> : null}
    </g>
  );
}

/** A ref line with its cardinality markers at both ends. */
export const RefSvg = memo(function RefSvg({
  refModel,
  route,
  state = 'normal',
}: RefSvgProps): ReactElement {
  const { c } = useColors();
  const user = safeColor(refModel.color);
  const stroke = state === 'highlight' && !user ? c('refHighlight') : (user ?? c('refStroke'));
  const width = state === 'highlight' ? 2 : 1.4;
  return (
    <g
      className="rv-ref"
      data-rv-ref={refModel.id}
      data-rv-state={state}
      opacity={state === 'dim' ? 0.18 : undefined}
    >
      <title>{refLabel(refModel)}</title>
      <path
        d={route.path}
        style={{ stroke, fill: 'none' }}
        strokeWidth={width}
        strokeDasharray={refModel.inactive ? '5 4' : undefined}
        strokeLinejoin="round"
      />
      <CardinalityMarker
        end={route.from}
        endpoint={refModel.from}
        stroke={stroke}
        bg={c('canvasBg')}
        width={width}
      />
      <CardinalityMarker
        end={route.to}
        endpoint={refModel.to}
        stroke={stroke}
        bg={c('canvasBg')}
        width={width}
      />
    </g>
  );
});
