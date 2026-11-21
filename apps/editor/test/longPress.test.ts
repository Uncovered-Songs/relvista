// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachLongPress, LONG_PRESS_MS } from '../src/diagram/longPress.js';

/** A pointer event (jsdom has no PointerEvent constructor everywhere). */
function pointer(type: string, init: { id?: number; x?: number; y?: number; kind?: string }) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
  });
  Object.defineProperty(e, 'pointerId', { value: init.id ?? 1 });
  Object.defineProperty(e, 'pointerType', { value: init.kind ?? 'touch' });
  return e;
}

describe('attachLongPress', () => {
  let root: HTMLDivElement;
  let node: HTMLDivElement;
  let menus: MouseEvent[];
  let detach: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    root.innerHTML = '<div class="rv-canvas"><div class="node"></div></div><div class="out"></div>';
    document.body.append(root);
    node = root.querySelector('.node')!;
    menus = [];
    node.addEventListener('contextmenu', (e) => menus.push(e));
    root.querySelector('.out')!.addEventListener('contextmenu', (e) => menus.push(e as MouseEvent));
    detach = attachLongPress(root);
  });
  afterEach(() => {
    detach();
    root.remove();
    vi.useRealTimers();
  });

  it('a held finger dispatches contextmenu at its position on the pressed element', () => {
    node.dispatchEvent(pointer('pointerdown', { x: 40, y: 60 }));
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(menus).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(menus).toHaveLength(1);
    expect(menus[0]!.clientX).toBe(40);
    expect(menus[0]!.clientY).toBe(60);
    expect(menus[0]!.button).toBe(2);
  });

  it('lifting early, moving (pan / drag) or a second finger cancels it', () => {
    node.dispatchEvent(pointer('pointerdown', { x: 40, y: 60 }));
    node.dispatchEvent(pointer('pointerup', { x: 40, y: 60 }));
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    node.dispatchEvent(pointer('pointerdown', { x: 40, y: 60 }));
    node.dispatchEvent(pointer('pointermove', { x: 40, y: 75 }));
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    node.dispatchEvent(pointer('pointerdown', { id: 1, x: 40, y: 60 }));
    node.dispatchEvent(pointer('pointerdown', { id: 2, x: 90, y: 60 }));
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(menus).toHaveLength(0);
  });

  it('small jitter does not cancel; mouse and pen presses and presses off the canvas are ignored', () => {
    node.dispatchEvent(pointer('pointerdown', { kind: 'mouse' }));
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    root.querySelector('.out')!.dispatchEvent(pointer('pointerdown', {}));
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(menus).toHaveLength(0);
    root.querySelector('.out')!.dispatchEvent(pointer('pointerup', {}));
    node.dispatchEvent(pointer('pointerdown', { x: 40, y: 60 }));
    node.dispatchEvent(pointer('pointermove', { x: 43, y: 63 }));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(menus).toHaveLength(1);
  });
});
