/**
 * Text input with a list of suggestions: the ARIA 1.2 combobox pattern ("list autocomplete with
 * automatic selection"). The first option is active while typing, so Enter picks it; ArrowUp /
 * ArrowDown move through the list, which stays in the input's focus (aria-activedescendant).
 */
import {
  useEffect,
  useId,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { SearchIcon } from '../viewer/icons.js';

export interface ComboOption {
  key: string;
  label: string;
  /** UTF-16 [start, end) ranges of `label` to mark as matched. */
  ranges?: ReadonlyArray<readonly [number, number]>;
  /** Small text before the label, e.g. the hit kind. */
  kind?: string;
}

/** `label` with the matched ranges in `<mark>`. */
export function Highlighted({
  label,
  ranges = [],
}: {
  label: string;
  ranges?: ReadonlyArray<readonly [number, number]>;
}): ReactElement {
  const parts: ReactNode[] = [];
  let at = 0;
  const sorted = [...ranges].filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  for (const [s, e] of sorted) {
    const start = Math.max(at, s);
    if (start >= e) continue;
    if (start > at) parts.push(label.slice(at, start));
    parts.push(<mark key={start}>{label.slice(start, e)}</mark>);
    at = e;
  }
  if (at < label.length) parts.push(label.slice(at));
  return <>{parts}</>;
}

export interface ComboboxProps {
  label: string;
  /** Hide the label visually (it stays the accessible name). */
  hideLabel?: boolean;
  placeholder?: string;
  text: string;
  onText(text: string): void;
  options: readonly ComboOption[];
  /** Whether the list shows (it never shows without options). */
  open: boolean;
  onPick(index: number): void;
  /**
   * Esc. Return true when the press was used here (e.g. it closed the list), false to let the
   * container handle it.
   */
  onEscape?(): boolean;
  onFocus?(): void;
  onBlur?(): void;
  inputRef?: Ref<HTMLInputElement>;
  /** Id of an element describing the input (a status line). */
  describedBy?: string;
  className?: string;
}

export function Combobox(p: ComboboxProps): ReactElement {
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const [active, setActive] = useState(0);
  const expanded = p.open && p.options.length > 0;
  // A new list starts at its first option (Enter picks the best hit).
  const optionsKey = p.options.map((o) => o.key).join('\u0000');
  useEffect(() => setActive(0), [optionsKey]);
  const current = expanded ? Math.min(active, p.options.length - 1) : -1;

  useEffect(() => {
    if (current < 0) return;
    const el = document.getElementById(optionId(current));
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const n = p.options.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      if (!expanded) {
        p.onFocus?.();
        setActive(e.key === 'ArrowDown' ? 0 : n - 1);
        return;
      }
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === 'Enter') {
      if (current < 0) return;
      e.preventDefault();
      p.onPick(current);
    } else if (e.key === 'Escape') {
      if (p.onEscape?.()) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  return (
    <div className={['rv-nav-combo', p.className ?? ''].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className={p.hideLabel ? 'rv-nav-sr' : 'rv-nav-label'}>
        {p.label}
      </label>
      <div className="rv-nav-field">
        <SearchIcon />
        <input
          ref={p.inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          aria-describedby={p.describedBy}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={p.placeholder}
          value={p.text}
          onChange={(e) => p.onText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={p.onFocus}
          onBlur={p.onBlur}
        />
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label={p.label}
        className="rv-nav-list"
        hidden={!expanded}
      >
        {expanded
          ? p.options.map((o, i) => (
              <li
                key={o.key}
                id={optionId(i)}
                role="option"
                aria-selected={i === current}
                className="rv-nav-option"
                // Keep the focus in the input (the listbox is driven from there).
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => i !== current && setActive(i)}
                onClick={() => p.onPick(i)}
              >
                {o.kind ? <span className="rv-nav-kind">{o.kind}</span> : null}
                <span className="rv-nav-option-label">
                  <Highlighted label={o.label} {...(o.ranges ? { ranges: o.ranges } : {})} />
                </span>
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}
