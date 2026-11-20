import {
  estimateTextWidth,
  type DetailLevel,
  type DiagramGeometry,
  type DiagramModel,
  type TextMeasure,
} from '@relvista/core';
import { useMemo, type CSSProperties, type ReactElement } from 'react';
import { colorResolver, type ColorMode } from '../theme.js';
import { ColorContext, useColors } from './context.js';
import { GroupSvg } from './GroupSvg.js';
import { NoteSvg } from './NoteSvg.js';
import { RefSvg } from './RefSvg.js';
import { highlightSets, routeAll, type EdgeStyle } from './routing.js';
import { TableSvg } from './TableSvg.js';

export interface DiagramSvgProps {
  /** View-filtered model (`selectView`). */
  model: DiagramModel;
  geometry: DiagramGeometry;
  colorMode?: ColorMode;
  detailLevel?: DetailLevel;
  /** Table, note or ref ids to emphasise; everything not related to them is dimmed. */
  highlight?: readonly string[] | null;
  edgeStyle?: EdgeStyle;
  /** Space around the diagram bounds, in diagram units. Default 24. */
  padding?: number;
  /** Fill the canvas background (default true); a colour string fills with that colour. */
  background?: boolean | string;
  /** Accessible title. */
  title?: string;
  /** `width`/`height` attributes; default the diagram size in px. Pass '100%' to fill a box. */
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Prefix for ids inside the SVG (filters). Default `rv`. */
  idPrefix?: string;
  /** Write literal colours instead of `var(--rv-*)` (standalone export). */
  literalColors?: boolean;
  /** Draw a card shadow (default true). */
  shadows?: boolean;
  measure?: TextMeasure;
}

/** The whole diagram as pure, SSR-safe SVG (no browser APIs). */
export function DiagramSvg(props: DiagramSvgProps): ReactElement {
  const colors = useMemo(
    () => colorResolver(props.colorMode ?? 'light', props.literalColors ?? false),
    [props.colorMode, props.literalColors],
  );
  return (
    <ColorContext.Provider value={colors}>
      <DiagramSvgInner {...props} />
    </ColorContext.Provider>
  );
}

function DiagramSvgInner({
  model,
  geometry,
  colorMode = 'light',
  detailLevel = 'all',
  highlight,
  edgeStyle = 'orthogonal',
  padding = 24,
  background = true,
  title,
  width,
  height,
  className,
  style,
  idPrefix = 'rv',
  shadows = true,
  measure = estimateTextWidth,
}: DiagramSvgProps): ReactElement {
  const { c } = useColors();
  const routes = useMemo(
    () => routeAll({ model, geometry, detailLevel, edgeStyle }),
    [model, geometry, detailLevel, edgeStyle],
  );
  const lit = useMemo(() => highlightSets(model, highlight), [model, highlight]);
  const b = geometry.bounds;
  const vbW = Math.max(1, (Number.isFinite(b.width) ? b.width : 0) + padding * 2);
  const vbH = Math.max(1, (Number.isFinite(b.height) ? b.height : 0) + padding * 2);
  const vbX = (Number.isFinite(b.x) ? b.x : 0) - padding;
  const vbY = (Number.isFinite(b.y) ? b.y : 0) - padding;
  const shadowId = shadows ? `${idPrefix}-shadow` : null;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      width={width ?? vbW}
      height={height ?? vbH}
      className={className ? `rv-diagram ${className}` : 'rv-diagram'}
      style={style}
      data-rv-color-mode={colorMode}
      role="img"
      aria-label={title ?? 'Entity-relationship diagram'}
    >
      {title ? <title>{title}</title> : null}
      {shadowId ? (
        <defs>
          <filter id={shadowId} x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow
              dx={0}
              dy={1}
              stdDeviation={2}
              style={{ floodColor: c('tableShadow') }}
              floodOpacity={1}
            />
          </filter>
        </defs>
      ) : null}
      {background ? (
        <rect
          className="rv-canvas"
          x={vbX}
          y={vbY}
          width={vbW}
          height={vbH}
          style={{ fill: typeof background === 'string' ? background : c('canvasBg') }}
        />
      ) : null}
      <g className="rv-groups">
        {model.groups.map((g) => {
          const box = geometry.groups[g.id];
          if (!box) return null;
          const dim = lit ? !g.tableIds.some((t) => lit.tables.has(t)) : false;
          return <GroupSvg key={g.id} group={g} box={box} dimmed={dim} />;
        })}
      </g>
      <g className="rv-notes">
        {model.stickyNotes.map((n) => {
          const box = geometry.nodes[n.id];
          if (!box) return null;
          return (
            <NoteSvg
              key={n.id}
              note={n}
              box={box}
              dimmed={lit ? !lit.tables.has(n.id) : false}
              shadowFilter={shadowId}
              measure={measure}
            />
          );
        })}
      </g>
      <g className="rv-refs">
        {model.refs.map((r) => {
          const route = routes.get(r.id);
          if (!route) return null;
          const state = lit ? (lit.refs.has(r.id) ? 'highlight' : 'dim') : 'normal';
          return <RefSvg key={r.id} refModel={r} route={route} state={state} />;
        })}
      </g>
      <g className="rv-tables">
        {model.tables.map((t) => {
          const box = geometry.nodes[t.id];
          if (!box) return null;
          return (
            <TableSvg
              key={t.id}
              table={t}
              box={box}
              detailLevel={box.detailLevel ?? detailLevel}
              dimmed={lit ? !lit.tables.has(t.id) : false}
              highlighted={lit ? (highlight?.includes(t.id) ?? false) : false}
              highlightColumns={lit?.columns.get(t.id) ?? null}
              shadowFilter={shadowId}
              measure={measure}
            />
          );
        })}
      </g>
    </svg>
  );
}
