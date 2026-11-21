/**
 * Focus chip (docs/design/phase3-v1.md §4.7): "Related to orders · 2 hops [−][+] ✕". The host
 * owns the focus; the chip only changes the hops (0..5) or exits.
 */
import type { ReactElement } from 'react';
import { MAX_FOCUS_HOPS } from '../share/deepLink.js';
import { CloseIcon, MinusIcon, PlusIcon } from '../viewer/icons.js';

/** Props of `FocusControl`. */
export interface FocusControlProps {
  /** Name of the focused table, shown in the control. */
  tableLabel: string;
  /** How many refs away related tables are shown (0..5). */
  hops: number;
  /** Called with the new number of hops. */
  onChange(h: number): void;
  /** Called when the user leaves focus mode. */
  onExit(): void;
  /** Class of the group element. */
  className?: string;
}

/**
 * The focus-mode chip: the focused table, a hops stepper and an exit button.
 *
 * @param props - See {@link FocusControlProps}.
 */
export function FocusControl({
  tableLabel,
  hops,
  onChange,
  onExit,
  className,
}: FocusControlProps): ReactElement {
  const h = Math.max(0, Math.min(MAX_FOCUS_HOPS, Math.floor(hops) || 0));
  const text = `${h} ${h === 1 ? 'hop' : 'hops'}`;
  return (
    <div
      role="group"
      aria-label={`Focus on ${tableLabel}`}
      className={['rv-nav-chip', 'rv-nav-focus', 'nodrag', 'nopan', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <span className="rv-nav-chip-text" aria-live="polite">
        Related to <strong>{tableLabel}</strong> · {text}
      </span>
      <button
        type="button"
        className="rv-nav-icon-button"
        title="Fewer hops"
        aria-label="Fewer hops"
        // aria-disabled, not disabled: the button keeps the keyboard focus at the limit.
        aria-disabled={h <= 0}
        onClick={() => h > 0 && onChange(h - 1)}
      >
        <MinusIcon />
      </button>
      <button
        type="button"
        className="rv-nav-icon-button"
        title="More hops"
        aria-label="More hops"
        aria-disabled={h >= MAX_FOCUS_HOPS}
        onClick={() => h < MAX_FOCUS_HOPS && onChange(h + 1)}
      >
        <PlusIcon />
      </button>
      <button
        type="button"
        className="rv-nav-icon-button"
        title="Show all tables (Esc)"
        aria-label="Exit focus"
        onClick={onExit}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
