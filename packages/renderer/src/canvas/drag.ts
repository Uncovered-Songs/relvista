/**
 * Drag bookkeeping of the editable canvas, without React Flow: group drags (a group moves its
 * visible member tables), the sub-pixel threshold, and keyboard nudges batched into one change.
 */

export interface Pos {
  x: number;
  y: number;
}

/** Moves shorter than this (px, diagram units) are not reported. */
export const MIN_DRAG = 1;
/** Arrow-key step (px); with Shift. */
export const NUDGE_STEP = 10;
export const NUDGE_STEP_FINE = 1;
/** Keyboard nudges are committed as one 'move' this long after the last key press (ms). */
export const NUDGE_COMMIT_MS = 300;

/** Member tables of a group that the active view draws (model order). */
export function visibleMembers(
  tableIds: readonly string[],
  visible: { has(id: string): boolean },
): string[] {
  return tableIds.filter((id) => visible.has(id));
}

/** A group drag in progress: where the group box and its members started. */
export interface GroupDrag {
  groupId: string;
  origin: Pos;
  members: ReadonlyMap<string, Pos>;
}

export function startGroupDrag(
  groupId: string,
  origin: Pos,
  memberIds: readonly string[],
  positions: { get(id: string): Pos | undefined },
): GroupDrag {
  const members = new Map<string, Pos>();
  for (const id of memberIds) {
    const p = positions.get(id);
    if (p) members.set(id, { x: p.x, y: p.y });
  }
  return { groupId, origin: { x: origin.x, y: origin.y }, members };
}

/** Member positions for the group box now at `at`: every member moves by the same delta. */
export function groupDragPositions(drag: GroupDrag, at: Pos): Map<string, Pos> {
  const dx = at.x - drag.origin.x;
  const dy = at.y - drag.origin.y;
  const out = new Map<string, Pos>();
  for (const [id, p] of drag.members) out.set(id, { x: p.x + dx, y: p.y + dy });
  return out;
}

/**
 * The end positions of the nodes that moved at least `min` px from their start (start order).
 * Ids missing from either map are skipped.
 */
export function movedPositions(
  start: ReadonlyMap<string, Pos>,
  end: { get(id: string): Pos | undefined },
  min = MIN_DRAG,
): Map<string, Pos> {
  const out = new Map<string, Pos>();
  for (const [id, s] of start) {
    const e = end.get(id);
    if (!e) continue;
    if (Math.hypot(e.x - s.x, e.y - s.y) >= min) out.set(id, { x: e.x, y: e.y });
  }
  return out;
}

/** Delta of an arrow key (Shift: fine step), or null for other keys. */
export function nudgeDelta(key: string, fine: boolean): Pos | null {
  const s = fine ? NUDGE_STEP_FINE : NUDGE_STEP;
  switch (key) {
    case 'ArrowLeft':
      return { x: -s, y: 0 };
    case 'ArrowRight':
      return { x: s, y: 0 };
    case 'ArrowUp':
      return { x: 0, y: -s };
    case 'ArrowDown':
      return { x: 0, y: s };
    default:
      return null;
  }
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Collects the ids of keyboard nudges and commits them once, `delay` ms after the last one (one
 * undo step for a burst of arrow presses).
 */
export class NudgeBatch {
  private ids = new Set<string>();
  private timer: unknown = null;

  constructor(
    private readonly commit: (ids: string[]) => void,
    private readonly delay = NUDGE_COMMIT_MS,
    private readonly timers: Timers = defaultTimers,
  ) {}

  get pending(): boolean {
    return this.ids.size > 0;
  }

  add(ids: Iterable<string>): void {
    for (const id of ids) this.ids.add(id);
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = this.timers.setTimeout(() => this.flush(), this.delay);
  }

  /** Commits now (if anything is pending). */
  flush(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    if (!this.ids.size) return;
    const ids = [...this.ids];
    this.ids.clear();
    this.commit(ids);
  }

  /** Drops pending nudges without committing. */
  cancel(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.ids.clear();
  }
}
