import { describe, expect, it } from 'vitest';
import { clearPadding } from '../src/diagram/clearPadding.js';

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe('clearPadding', () => {
  // The 390 × 844 phone layout of the review: pane below the tabs, toolbar and legend at the top,
  // the Changes sheet docked above the detail switch.
  const pane = rect(0, 87, 390, 720);

  it('keeps a phone fit below the toolbar and legend and above the Changes sheet', () => {
    const toolbar = rect(10, 97, 370, 52);
    const legend = rect(10, 155, 180, 30);
    const sheet = rect(10, 410, 370, 325);
    const p = clearPadding(pane, [toolbar, legend, sheet]);
    expect(p.top).toBe(185 - 87 + 12);
    expect(p.bottom).toBe(807 - 410 + 12);
    expect(p.left).toBe(0);
    expect(p.right).toBe(0);
  });

  it('a tall panel beside the diagram covers its side (wide Changes panel)', () => {
    const wide = rect(0, 50, 1000, 800);
    const p = clearPadding(wide, [rect(670, 104, 320, 736), rect(700, 60, 290, 36)]);
    expect(p.right).toBe(1000 - 670 + 12);
    expect(p.top).toBe(96 - 50 + 12);
    expect(p.bottom).toBe(0);
  });

  it('ignores overlays outside the pane and an empty pane', () => {
    expect(clearPadding(pane, [rect(0, 0, 390, 60)])).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect(clearPadding(rect(0, 0, 0, 0), [rect(0, 0, 10, 10)]).top).toBe(0);
  });
});
