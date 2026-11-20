import type { StickyNote, Table, TableGroup } from '@relvista/core';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, type ReactElement } from 'react';
import { GroupSvg } from '../svg/GroupSvg.js';
import { NoteSvg } from '../svg/NoteSvg.js';
import { rowCenterOffset } from '../svg/routing.js';
import { TableSvg } from '../svg/TableSvg.js';
import { parseHandleId, useViewerState } from './context.js';

export type TableFlowNode = Node<{ table: Table; w: number; h: number }, 'rvTable'>;
export type NoteFlowNode = Node<{ note: StickyNote; w: number; h: number }, 'rvNote'>;
export type GroupFlowNode = Node<{ group: TableGroup; w: number; h: number }, 'rvGroup'>;
export type FlowNode = TableFlowNode | NoteFlowNode | GroupFlowNode;

const HIDDEN_HANDLE = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 0,
  background: 'transparent',
  pointerEvents: 'none',
} as const;

function RowHandles({ ids }: { ids: ReadonlySet<string> | undefined }): ReactElement | null {
  if (!ids || ids.size === 0) return null;
  return (
    <>
      {[...ids].map((id) => {
        const h = parseHandleId(id);
        if (!h) return null;
        return (
          <Handle
            key={id}
            id={id}
            type={h.type}
            position={h.side === 'left' ? Position.Left : Position.Right}
            isConnectable={false}
            style={{ ...HIDDEN_HANDLE, top: rowCenterOffset(h.row) }}
          />
        );
      })}
    </>
  );
}

export const TableNode = memo(function TableNode({
  id,
  data,
}: NodeProps<TableFlowNode>): ReactElement {
  const v = useViewerState();
  const { w, h, table } = data;
  return (
    <div
      className={`rv-node rv-node-table${v.selectedId === id ? ' rv-selected' : ''}`}
      style={{ width: w, height: h }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="rv-node-svg">
        <TableSvg
          table={table}
          box={{ x: 0, y: 0, width: w, height: h }}
          detailLevel={v.detailLevel}
          dimmed={v.lit ? !v.lit.tables.has(id) : false}
          highlighted={v.hoveredId === id}
          selected={v.selectedId === id}
          highlightColumns={v.lit?.columns.get(id) ?? null}
        />
      </svg>
      <RowHandles ids={v.handles.get(id)} />
    </div>
  );
});

export const NoteNode = memo(function NoteNode({
  id,
  data,
}: NodeProps<NoteFlowNode>): ReactElement {
  const v = useViewerState();
  const { w, h, note } = data;
  return (
    <div className="rv-node rv-node-note" style={{ width: w, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="rv-node-svg">
        <NoteSvg
          note={note}
          box={{ x: 0, y: 0, width: w, height: h }}
          dimmed={v.lit ? !v.lit.tables.has(id) : false}
        />
      </svg>
    </div>
  );
});

export const GroupNode = memo(function GroupNode({ data }: NodeProps<GroupFlowNode>): ReactElement {
  const v = useViewerState();
  const { w, h, group } = data;
  const dimmed = v.lit ? !group.tableIds.some((t) => v.lit!.tables.has(t)) : false;
  return (
    <div className="rv-node rv-node-group" style={{ width: w, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="rv-node-svg">
        <GroupSvg group={group} box={{ x: 0, y: 0, width: w, height: h }} dimmed={dimmed} />
      </svg>
    </div>
  );
});

export const nodeTypes = { rvTable: TableNode, rvNote: NoteNode, rvGroup: GroupNode };
