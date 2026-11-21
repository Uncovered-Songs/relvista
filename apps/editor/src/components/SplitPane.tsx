import {
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

const MIN_PX = 280;

/** Two panes and a 6 px separator (role="separator", arrows ±2 %, Home/End, double-click → 40 %). */
export function SplitPane(props: {
  split: number;
  onSplit(split: number): void;
  first: ReactNode;
  second: ReactNode;
}): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const clamp = (v: number) => {
    const w = root.current?.clientWidth ?? 1000;
    const min = Math.min(0.5, MIN_PX / Math.max(w, 1));
    return Math.min(1 - min, Math.max(min, v));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    document.body.classList.add('ed-resizing');
    const move = (ev: globalThis.PointerEvent) => {
      const r = root.current!.getBoundingClientRect();
      props.onSplit(clamp((ev.clientX - r.left) / r.width));
    };
    const up = () => {
      document.body.classList.remove('ed-resizing');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = 0.02;
    let v: number | null = null;
    if (e.key === 'ArrowLeft') v = props.split - step;
    else if (e.key === 'ArrowRight') v = props.split + step;
    else if (e.key === 'Home') v = 0;
    else if (e.key === 'End') v = 1;
    if (v === null) return;
    e.preventDefault();
    props.onSplit(clamp(v));
  };
  const pct = Math.round(props.split * 100);
  return (
    <div
      className="ed-split"
      ref={root}
      style={{ ['--ed-split' as string]: `${props.split * 100}%` }}
    >
      <div className="ed-split__pane ed-split__pane--first">{props.first}</div>
      <div
        className="ed-split__sep"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize code and diagram"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onDoubleClick={() => props.onSplit(0.4)}
      />
      <div className="ed-split__pane ed-split__pane--second">{props.second}</div>
    </div>
  );
}
