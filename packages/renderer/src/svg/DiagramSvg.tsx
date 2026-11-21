import {
  estimateTextWidth,
  tableTitle,
  type DetailLevel,
  type DiagramGeometry,
  type DiagramModel,
  type TextMeasure,
} from '@relvista/core';
import { useMemo, type CSSProperties, type ReactElement } from 'react';
import { colorResolver, type ColorMode, type PaletteOverrides } from '../theme.js';
import { CollapsedGroupSvg } from './CollapsedGroupSvg.js';
import { mergeRefs, mergedMarkers, primaryRef } from './collapsed.js';
import { ColorContext, useColors } from './context.js';
import {
  badgeOf,
  columnTonesOf,
  dimmedByDecorations,
  nodeTone,
  refTone,
  type Decorations,
} from './decorations.js';
import { GroupSvg } from './GroupSvg.js';
import { NoteSvg } from './NoteSvg.js';
import { RefSvg } from './RefSvg.js';
import { highlightSets, routeAll, type EdgeStyle, type RefRoute } from './routing.js';
import { TableSvg } from './TableSvg.js';

/** Props of `DiagramSvg`. */
export interface DiagramSvgProps {
  /** View-filtered model (`selectView`). */
  model: DiagramModel;
  /** Where everything is drawn (`layoutDiagram` / `layoutDiagramSync`). */
  geometry: DiagramGeometry;
  /** Light or dark palette. Default `light`. */
  colorMode?: ColorMode;
  /** Which columns tables show. Default `all`. */
  detailLevel?: DetailLevel;
  /** Table, note or ref ids to emphasise; everything not related to them is dimmed. */
  highlight?: readonly string[] | null;
  /** How refs are drawn. Default `orthogonal`. */
  edgeStyle?: EdgeStyle;
  /** Space around the diagram bounds, in diagram units. Default 24. */
  padding?: number;
  /** Fill the canvas background (default true); a colour string fills with that colour. */
  background?: boolean | string;
  /** Accessible title. */
  title?: string;
  /** `width`/`height` attributes; default the diagram size in px. Pass '100%' to fill a box. */
  width?: number | string;
  /** See `width`. */
  height?: number | string;
  /** Class of the `<svg>` element. */
  className?: string;
  /** Inline style of the `<svg>` element. */
  style?: CSSProperties;
  /** Prefix for ids inside the SVG (filters). Default `rv`. */
  idPrefix?: string;
  /** Write literal colours instead of `var(--rv-*)` (standalone export). */
  literalColors?: boolean;
  /**
   * Colours and fonts replacing the `colorMode` palette's (the literal values, and the fallbacks
   * of the `var(--rv-*)` references), such as what a page shows (`resolvePalette`).
   */
  palette?: PaletteOverrides | null;
  /** Draw a card shadow (default true). */
  shadows?: boolean;
  /**
   * Text measurement; use the one the geometry was laid out with. Default: the built-in
   * width estimate.
   */
  measure?: TextMeasure;
  /** Search hits, paths, focus and diff tones (§4.2). */
  decorations?: Decorations | null;
  /** Precomputed ref routes keyed by ref id (default: `routeAll` of this model and geometry). */
  routes?: ReadonlyMap<string, RefRoute> | null;
}

/** The whole diagram as pure, SSR-safe SVG (no browser APIs). */
export function DiagramSvg(props: DiagramSvgProps): ReactElement {
  const colors = useMemo(
    () => colorResolver(props.colorMode ?? 'light', props.literalColors ?? false, props.palette),
    [props.colorMode, props.literalColors, props.palette],
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
  decorations,
  routes: givenRoutes,
}: DiagramSvgProps): ReactElement {
  const { c } = useColors();
  // `routeAll`'s default `avoid: 'tables'`: lines go round unrelated tables (§4.1).
  const routes = useMemo(
    () => givenRoutes ?? routeAll({ model, geometry, detailLevel, edgeStyle }),
    [givenRoutes, model, geometry, detailLevel, edgeStyle],
  );
  // A collapsed group in the highlight stands for its member tables.
  const expandedHighlight = useMemo(() => {
    if (!highlight) return highlight;
    const out: string[] = [];
    for (const id of highlight) {
      out.push(id);
      const g = geometry.groups[id]?.collapsed ? model.groups.find((x) => x.id === id) : undefined;
      if (g) out.push(...g.tableIds);
    }
    return out;
  }, [model, geometry, highlight]);
  const lit = useMemo(() => highlightSets(model, expandedHighlight), [model, expandedHighlight]);
  // One line per pair of display nodes (merged refs of collapsed groups); inactive lines first,
  // so active refs draw over them.
  const lines = useMemo(() => {
    const drawn = mergeRefs(model, geometry).flatMap((line) => {
      const p = primaryRef(line, routes);
      return p ? [{ line, ...p, inactive: line.refs.every((r) => r.inactive) }] : [];
    });
    return [...drawn.filter((d) => d.inactive), ...drawn.filter((d) => !d.inactive)];
  }, [model, geometry, routes]);
  const tablesById = useMemo(() => new Map(model.tables.map((t) => [t.id, t])), [model]);
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
          if (!box || box.collapsed) return null;
          const dim =
            (lit ? !g.tableIds.some((t) => lit.tables.has(t)) : false) ||
            dimmedByDecorations(decorations, g.id);
          return (
            <GroupSvg
              key={g.id}
              group={g}
              box={box}
              dimmed={dim}
              tone={nodeTone(decorations, g.id)}
              badge={badgeOf(decorations, g.id)}
            />
          );
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
              dimmed={
                (lit ? !lit.tables.has(n.id) : false) || dimmedByDecorations(decorations, n.id)
              }
              shadowFilter={shadowId}
              measure={measure}
              idPrefix={idPrefix}
              tone={nodeTone(decorations, n.id)}
              badge={badgeOf(decorations, n.id)}
            />
          );
        })}
      </g>
      <g className="rv-refs">
        {lines.map(({ line, ref, route }) => {
          const ids = line.refs.map((r) => r.id);
          const state = lit ? (ids.some((id) => lit.refs.has(id)) ? 'highlight' : 'dim') : 'normal';
          const tone = ids.map((id) => refTone(decorations, id)).find((t) => t !== undefined);
          return (
            <RefSvg
              key={line.id}
              refModel={ref}
              route={route}
              state={state}
              tone={tone}
              dimmed={!!decorations?.dimOthers && tone === undefined}
              merged={
                line.refs.length > 1 ? { refs: line.refs, ...mergedMarkers(line, ref) } : null
              }
            />
          );
        })}
      </g>
      <g className="rv-collapsed-groups">
        {model.groups.map((g) => {
          const box = geometry.groups[g.id];
          if (!box?.collapsed) return null;
          const members = g.tableIds.flatMap((id) => {
            const t = tablesById.get(id);
            return t ? [tableTitle(t)] : [];
          });
          return (
            <CollapsedGroupSvg
              key={g.id}
              group={g}
              box={box}
              memberNames={members}
              dimmed={
                (lit ? !g.tableIds.some((t) => lit.tables.has(t)) : false) ||
                dimmedByDecorations(decorations, g.id)
              }
              highlighted={!!highlight?.includes(g.id)}
              shadowFilter={shadowId}
              measure={measure}
              tone={nodeTone(decorations, g.id)}
              badge={badgeOf(decorations, g.id)}
            />
          );
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
              dimmed={
                (lit ? !lit.tables.has(t.id) : false) || dimmedByDecorations(decorations, t.id)
              }
              highlighted={lit ? (highlight?.includes(t.id) ?? false) : false}
              highlightColumns={lit?.columns.get(t.id) ?? null}
              shadowFilter={shadowId}
              measure={measure}
              tone={nodeTone(decorations, t.id)}
              columnTones={columnTonesOf(decorations, t.id)}
              badge={badgeOf(decorations, t.id)}
            />
          );
        })}
      </g>
    </svg>
  );
}
