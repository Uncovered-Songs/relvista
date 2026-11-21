/**
 * Layout undo/redo: snapshots of the whole `Layout` (immutable, so snapshots are cheap shares).
 * 'move' / 'auto-layout' / 'settings' / 'resize' push; 'place' and renames amend the current entry
 * (they are not user edits); opening a document clears the stack. `batch` merges the pushes of one
 * user action (deleting notes, deleting or renaming a view) into one step.
 */
import type { Layout } from '@relvista/core';
import type { LayoutChange } from '@relvista/renderer';

export const HISTORY_CAP = 200;

/** How a canvas layout change enters the history: a user edit pushes, auto-placement amends. */
export function historyActionOf(kind: LayoutChange['kind']): 'push' | 'amend' {
  return kind === 'place' ? 'amend' : 'push';
}

export class LayoutHistory {
  private past: Array<Layout | null> = [];
  private future: Array<Layout | null> = [];
  private present: Layout | null = null;
  /** Older entries were dropped at the cap: the layout at open is no longer known. */
  private trimmed = false;
  /** Depth of nested `batch` calls, and whether the open batch already pushed its step. */
  private batchDepth = 0;
  private batchPushed = false;

  constructor(
    initial: Layout | null = null,
    private readonly cap = HISTORY_CAP,
  ) {
    this.present = initial;
  }

  get current(): Layout | null {
    return this.present;
  }

  /**
   * The layout as opened (amended like every entry), or undefined once it fell off the cap.
   * Undoing all the way back reaches it.
   */
  get base(): Layout | null | undefined {
    if (this.trimmed) return undefined;
    return this.past.length > 0 ? this.past[0]! : this.present;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  /** A user edit: the previous layout becomes undoable. Inside `batch`, merged into one step. */
  push(next: Layout | null): void {
    if (this.batchDepth > 0) {
      if (this.batchPushed) {
        this.present = next;
        this.future = [];
        return;
      }
      this.batchPushed = true;
    }
    this.past.push(this.present);
    if (this.past.length > this.cap) {
      this.past.splice(0, this.past.length - this.cap);
      this.trimmed = true;
    }
    this.present = next;
    this.future = [];
  }

  /**
   * Not a user edit ('place', renames): replaces the present and applies the same transform to
   * every snapshot, so undo never brings back stale ids or removes auto-placed positions.
   */
  amend(next: Layout | null, transform?: (l: Layout | null) => Layout | null): void {
    this.present = next;
    if (transform) {
      this.past = this.past.map(transform);
      this.future = this.future.map(transform);
    }
  }

  /**
   * Runs `fn`; every `push` it makes (directly or through canvas callbacks it triggers) becomes
   * one undo step: undo returns to the layout before the first of them.
   */
  batch<T>(fn: () => T): T {
    if (this.batchDepth === 0) this.batchPushed = false;
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0) this.batchPushed = false;
    }
  }

  undo(): Layout | null | undefined {
    if (this.past.length === 0) return undefined;
    this.future.push(this.present);
    this.present = this.past.pop()!;
    return this.present;
  }

  redo(): Layout | null | undefined {
    if (this.future.length === 0) return undefined;
    this.past.push(this.present);
    this.present = this.future.pop()!;
    return this.present;
  }

  /** Opening a document. */
  clear(initial: Layout | null): void {
    this.past = [];
    this.future = [];
    this.present = initial;
    this.trimmed = false;
  }

  get size(): { past: number; future: number } {
    return { past: this.past.length, future: this.future.length };
  }
}
