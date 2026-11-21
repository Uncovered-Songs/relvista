/**
 * The Colour ▸ submenu of the node and edge menus (design phase3 §6.5): 12 swatches (dbdiagram's
 * flat colours plus relvista's), "Custom…" (a native colour input) and "Default" (removes the
 * setting). Colours are written `#rrggbb` lowercase by the edit helpers.
 */
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactElement } from 'react';
import { CheckIcon } from './icons.js';
import './editing.css';

export interface Swatch {
  name: string;
  color: string;
}

/** Four columns × three rows. The first eight are the colours dbdiagram offers. */
export const SWATCHES: readonly Swatch[] = [
  { name: 'Blue', color: '#3498db' },
  { name: 'Green', color: '#2ecc71' },
  { name: 'Teal', color: '#1abc9c' },
  { name: 'Purple', color: '#8e44ad' },
  { name: 'Red', color: '#e74c3c' },
  { name: 'Orange', color: '#e67e22' },
  { name: 'Yellow', color: '#f1c40f' },
  { name: 'Slate', color: '#34495e' },
  { name: 'Navy', color: '#3d5a80' },
  { name: 'Indigo', color: '#2f6fed' },
  { name: 'Olive', color: '#79ad51' },
  { name: 'Grey', color: '#7f8c8d' },
];

const COLUMNS = 4;

export interface ColorMenuProps {
  /** The colour the targets share (lowercase `#rrggbb`), or null (default / mixed). */
  current: string | null;
  /** Whether any colour is set on a target (enables "Default"). */
  hasColor: boolean;
  /** Accessible name of the submenu, e.g. "Header colour". */
  label: string;
  onPick(color: string | null): void;
  /** ArrowLeft on the first column / Escape: back to the parent menu. */
  onBack(): void;
  /** Focus the first swatch when opened from the keyboard. */
  autoFocus?: boolean;
}

export function ColorMenu({
  current,
  hasColor,
  label,
  onPick,
  onBack,
  autoFocus,
}: ColorMenuProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const custom = useRef<HTMLInputElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useLayoutEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    const checked = el?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? el?.querySelector<HTMLElement>('[role^="menuitem"]'))?.focus();
  }, [autoFocus]);

  // The native `change` event fires once the picker closes (React's onChange fires on every
  // `input` while dragging, which would write one edit per step).
  useEffect(() => {
    const input = custom.current;
    if (!input) return;
    const onChange = () => pick.current(input.value);
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, []);

  const items = () => [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const swatches = SWATCHES.length;
    const go = (n: number) => {
      e.preventDefault();
      e.stopPropagation();
      list[(n + list.length) % list.length]?.focus();
    };
    switch (e.key) {
      case 'ArrowRight':
        if (i >= 0 && i < swatches) go(i % COLUMNS === COLUMNS - 1 ? i : i + 1);
        else e.stopPropagation();
        break;
      case 'ArrowLeft':
        if (i >= 0 && i < swatches && i % COLUMNS > 0) go(i - 1);
        else {
          e.preventDefault();
          e.stopPropagation();
          onBack();
        }
        break;
      case 'ArrowDown':
        go(i < 0 ? 0 : i < swatches - COLUMNS ? i + COLUMNS : i < swatches ? swatches : i + 1);
        break;
      case 'ArrowUp':
        go(
          i <= 0
            ? list.length - 1
            : i < swatches
              ? i - COLUMNS
              : i === swatches
                ? swatches - COLUMNS
                : i - 1,
        );
        break;
      case 'Home':
        go(0);
        break;
      case 'End':
        go(list.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onBack();
        break;
    }
  };

  /** The colour set when it is none of the swatches (Custom… is then the checked item). */
  const customColor =
    current && !SWATCHES.some((s) => s.color.toLowerCase() === current.toLowerCase())
      ? current
      : null;

  return (
    <div
      ref={ref}
      className="ed-menu ed-menu--sub ed-colormenu"
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <div className="ed-colormenu__grid" role="group" aria-label="Swatches">
        {SWATCHES.map((s) => (
          <button
            key={s.color}
            type="button"
            role="menuitemradio"
            aria-checked={current === s.color}
            aria-label={`${s.name} ${s.color}`}
            title={`${s.name} ${s.color}`}
            className="ed-colormenu__swatch"
            style={{ background: s.color }}
            tabIndex={-1}
            onClick={() => onPick(s.color)}
          >
            {current === s.color && <CheckIcon />}
          </button>
        ))}
      </div>
      <div className="ed-menu__sep" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="ed-menu__item ed-colormenu__custom"
        tabIndex={-1}
        onClick={() => {
          const input = custom.current;
          if (!input) return;
          try {
            input.showPicker();
          } catch {
            input.click();
          }
        }}
      >
        <span className="ed-menu__check" aria-hidden="true">
          {customColor && <CheckIcon />}
        </span>
        <span className="ed-menu__label">Custom…</span>
        {/* A colour well: the custom colour in use, else the colour wheel (never an empty box). */}
        <span
          className="ed-colormenu__preview"
          data-custom={customColor ? 'true' : 'false'}
          aria-hidden="true"
          {...(customColor ? { style: { background: customColor } } : {})}
        />
      </button>
      {/* The native picker the Custom… item opens; not a menu item of its own. */}
      <input
        ref={custom}
        type="color"
        aria-hidden="true"
        tabIndex={-1}
        defaultValue={current ?? '#3d5a80'}
        className="ed-colormenu__input"
      />
      <button
        type="button"
        role="menuitem"
        className="ed-menu__item"
        aria-disabled={!hasColor || undefined}
        title={hasColor ? 'Remove the colour setting' : 'No colour is set'}
        tabIndex={-1}
        onClick={() => {
          if (hasColor) onPick(null);
        }}
      >
        <span className="ed-menu__check" aria-hidden="true">
          {!hasColor && <CheckIcon />}
        </span>
        <span className="ed-menu__label">Default</span>
      </button>
    </div>
  );
}
