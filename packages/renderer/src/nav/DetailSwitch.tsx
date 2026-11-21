/**
 * Detail level switch (docs/design/phase3-v1.md §4.7): a radio group "Names · Keys · All" with a
 * roving tab stop; arrow keys move and select, as native radio buttons do.
 */
import type { DetailLevel } from '@relvista/core';
import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';

/** The detail levels in switch order, with their labels and hints. */
export const DETAIL_LEVELS: ReadonlyArray<{ value: DetailLevel; label: string; hint: string }> = [
  { value: 'names', label: 'Names', hint: 'Table names only' },
  { value: 'keys', label: 'Keys', hint: 'Primary and foreign keys' },
  { value: 'all', label: 'All', hint: 'Every column' },
];

/** Props of `DetailSwitch`. */
export interface DetailSwitchProps {
  /** The detail level shown as selected. */
  value: DetailLevel;
  /** Called with the level the user picks. */
  onChange(v: DetailLevel): void;
  /** Accessible name of the group. Default 'Detail level'. */
  label?: string;
  /** Class of the group element. */
  className?: string;
}

/**
 * A segmented radio group choosing the detail level (Names, Keys, All), operable with arrow keys.
 *
 * @param props - See {@link DetailSwitchProps}.
 */
export function DetailSwitch({
  value,
  onChange,
  label = 'Detail level',
  className,
}: DetailSwitchProps): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const index = Math.max(
    0,
    DETAIL_LEVELS.findIndex((d) => d.value === value),
  );
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const n = DETAIL_LEVELS.length;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(DETAIL_LEVELS[next]!.value);
    root.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={label}
      className={['rv-nav-detail', className ?? ''].filter(Boolean).join(' ')}
      onKeyDown={onKeyDown}
    >
      {DETAIL_LEVELS.map((d, i) => (
        <button
          key={d.value}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          title={d.hint}
          className="rv-nav-detail-option"
          onClick={() => onChange(d.value)}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
