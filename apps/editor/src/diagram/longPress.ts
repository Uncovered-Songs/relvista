/**
 * Long-press on a touch screen opens the canvas's context menus (node, edge, pane). iOS Safari
 * never fires `contextmenu` for a long-press, and the v1 canvas actions (Show related, Collapse,
 * note colour, Add to view, ref colour…) live in those menus, so a held finger dispatches the same
 * `contextmenu` event a right-click would, at the finger's position. Movement past a few pixels
 * (a pan or a drag), a second finger or lifting the finger early cancels it.
 */
import { useEffect, type RefObject } from 'react';

/** How long a finger must rest before the menu opens (ms). */
export const LONG_PRESS_MS = 500;
/** Movement (px) that turns a press into a pan or a drag. */
export const LONG_PRESS_SLOP = 8;

export interface LongPressOptions {
  /** Whether a press on this element may open a menu (default: inside `.rv-canvas`). */
  accept?(target: Element): boolean;
  delay?: number;
  slop?: number;
}

/**
 * Attaches the long-press handler to `el`. Returns the detach function. Exported for tests; the
 * editor uses `useLongPressMenu`.
 */
export function attachLongPress(el: HTMLElement, options: LongPressOptions = {}): () => void {
  const delay = options.delay ?? LONG_PRESS_MS;
  const slop = options.slop ?? LONG_PRESS_SLOP;
  const accept = options.accept ?? ((t: Element) => !!t.closest('.rv-canvas'));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let press: { id: number; x: number; y: number; target: Element } | null = null;
  /** Until then, the browser's own contextmenu / click of the same gesture is swallowed. */
  let swallowUntil = 0;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    press = null;
  };

  const fire = () => {
    timer = null;
    const p = press;
    press = null;
    if (!p) return;
    const at = el.ownerDocument.elementFromPoint?.(p.x, p.y) ?? null;
    const target = at && el.contains(at) ? at : p.target;
    swallowUntil = Date.now() + 800;
    target.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 2,
        buttons: 0,
        clientX: p.x,
        clientY: p.y,
      }),
    );
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if (press) {
      // A second finger: a pinch, not a press.
      cancel();
      return;
    }
    const t = e.target as Element | null;
    if (!t || !accept(t)) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, target: t };
    timer = setTimeout(fire, delay);
  };
  const onMove = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > slop) cancel();
  };
  const onUp = (e: PointerEvent) => {
    if (press && e.pointerId === press.id) cancel();
  };
  const onNativeMenu = (e: MouseEvent) => {
    if (!e.isTrusted) return;
    // Android Chrome fires its own contextmenu for a long-press: whichever comes first wins.
    if (press) {
      cancel();
      return;
    }
    if (Date.now() < swallowUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const onClick = (e: MouseEvent) => {
    // The tap that ends a long-press is not a click on what is under the finger.
    if (e.isTrusted && Date.now() < swallowUntil) {
      swallowUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  el.addEventListener('pointerdown', onDown, true);
  el.addEventListener('pointermove', onMove, true);
  el.addEventListener('pointerup', onUp, true);
  el.addEventListener('pointercancel', onUp, true);
  el.addEventListener('contextmenu', onNativeMenu, true);
  el.addEventListener('click', onClick, true);
  return () => {
    cancel();
    el.removeEventListener('pointerdown', onDown, true);
    el.removeEventListener('pointermove', onMove, true);
    el.removeEventListener('pointerup', onUp, true);
    el.removeEventListener('pointercancel', onUp, true);
    el.removeEventListener('contextmenu', onNativeMenu, true);
    el.removeEventListener('click', onClick, true);
  };
}

/** Long-press → context menu inside the element `ref` points at. */
export function useLongPressMenu(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return attachLongPress(el);
  }, [ref]);
}
