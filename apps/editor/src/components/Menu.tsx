/**
 * One menu component (WAI-ARIA menu button): `aria-haspopup="menu"`, roving tabindex, arrows,
 * Home/End, type-ahead, submenus (ArrowRight / ArrowLeft), Esc returns focus to the button.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { CheckIcon, ChevronDown, ChevronRight } from './icons.js';

export interface MenuItem {
  id: string;
  label: string;
  /** Shown right-aligned, e.g. "⌘S". */
  shortcut?: string;
  /** Second line, muted. */
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Tooltip, e.g. why an item is disabled. */
  title?: string;
  checked?: boolean;
  onSelect?: () => void;
  submenu?: MenuItem[];
  /** Separator drawn before this item. */
  separator?: boolean;
  /** Non-interactive group heading drawn before this item. */
  heading?: string;
}

interface ListProps {
  items: MenuItem[];
  labelledBy?: string;
  label?: string;
  level: number;
  initialFocus: 'first' | 'last' | 'none';
  onClose(returnFocus: boolean): void;
  onBack?: () => void;
  className?: string;
}

function MenuList({
  items,
  labelledBy,
  label,
  level,
  initialFocus,
  onClose,
  onBack,
  className,
}: ListProps): ReactElement {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [active, setActive] = useState(() =>
    initialFocus === 'last' ? lastEnabled(items) : firstEnabled(items),
  );
  const [openSub, setOpenSub] = useState<{ index: number; focus: 'first' | 'none' } | null>(null);
  const typed = useRef({ text: '', at: 0 });

  useLayoutEffect(() => {
    // Mount only: focus the first (or last) item when opened from the keyboard or a click.
    if (initialFocus !== 'none') refs.current[active]?.focus();
  }, []);

  const focus = (i: number) => {
    setActive(i);
    refs.current[i]?.focus();
  };

  const move = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= items.length; k++) {
      const i = (from + dir * k + items.length * 2) % items.length;
      if (!items[i]!.disabled) return i;
    }
    return from;
  };

  const activate = (i: number) => {
    const it = items[i];
    if (!it || it.disabled) return;
    if (it.submenu) {
      setOpenSub({ index: i, focus: 'first' });
      return;
    }
    onClose(true);
    it.onSelect?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (openSub && e.target !== refs.current[openSub.index]) return; // submenu handles its keys
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focus(move(active, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        focus(move(active, -1));
        break;
      case 'Home':
        e.preventDefault();
        focus(firstEnabled(items));
        break;
      case 'End':
        e.preventDefault();
        focus(lastEnabled(items));
        break;
      case 'ArrowRight':
        if (items[active]?.submenu) {
          e.preventDefault();
          setOpenSub({ index: active, focus: 'first' });
        }
        break;
      case 'ArrowLeft':
        if (level > 0) {
          e.preventDefault();
          e.stopPropagation();
          onBack?.();
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        if (level > 0) onBack?.();
        else onClose(true);
        break;
      case 'Tab':
        onClose(false);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        activate(active);
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const now = Date.now();
          const t = typed.current;
          t.text = now - t.at > 600 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
          t.at = now;
          const start = t.text.length === 1 ? active + 1 : active;
          for (let k = 0; k < items.length; k++) {
            const i = (start + k) % items.length;
            const it = items[i]!;
            if (!it.disabled && it.label.toLowerCase().startsWith(t.text)) {
              focus(i);
              break;
            }
          }
        }
    }
  };

  return (
    <div
      className={`ed-menu ${className ?? ''}`}
      role="menu"
      aria-labelledby={labelledBy}
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {items.map((it, i) => (
        <div key={it.id} className="ed-menu__row" role="none">
          {it.heading && (
            <div className="ed-menu__heading" role="presentation">
              {it.heading}
            </div>
          )}
          {it.separator && !it.heading && <div className="ed-menu__sep" role="separator" />}
          <button
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={it.checked !== undefined ? 'menuitemradio' : 'menuitem'}
            aria-checked={it.checked}
            aria-disabled={it.disabled || undefined}
            aria-haspopup={it.submenu ? 'menu' : undefined}
            aria-expanded={it.submenu ? openSub?.index === i : undefined}
            tabIndex={i === active ? 0 : -1}
            className="ed-menu__item"
            title={it.title}
            onClick={() => activate(i)}
            onMouseEnter={() => {
              if (it.disabled) return;
              setActive(i);
              refs.current[i]?.focus();
              setOpenSub(it.submenu ? { index: i, focus: 'none' } : null);
            }}
          >
            <span className="ed-menu__check" aria-hidden="true">
              {it.checked ? <CheckIcon /> : it.icon}
            </span>
            <span className="ed-menu__label">
              {it.label}
              {it.hint && <span className="ed-menu__hint">{it.hint}</span>}
            </span>
            {it.shortcut && <kbd className="ed-menu__kbd">{it.shortcut}</kbd>}
            {it.submenu && <ChevronRight className="ed-menu__chev" />}
          </button>
          {it.submenu && openSub?.index === i && (
            <MenuList
              items={it.submenu}
              label={it.label}
              level={level + 1}
              initialFocus={openSub.focus}
              className="ed-menu--sub"
              onClose={onClose}
              onBack={() => {
                setOpenSub(null);
                refs.current[i]?.focus();
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function firstEnabled(items: MenuItem[]): number {
  const i = items.findIndex((x) => !x.disabled);
  return i < 0 ? 0 : i;
}

function lastEnabled(items: MenuItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) if (!items[i]!.disabled) return i;
  return 0;
}

export interface MenuButtonProps {
  label: ReactNode;
  /** Accessible name when `label` is an icon. */
  ariaLabel?: string;
  items: MenuItem[] | (() => MenuItem[]);
  className?: string;
  title?: string;
  align?: 'left' | 'right';
  chevron?: boolean;
}

export function MenuButton({
  label,
  ariaLabel,
  items,
  className,
  title,
  align = 'left',
  chevron = true,
}: MenuButtonProps): ReactElement {
  const [open, setOpen] = useState<'first' | 'last' | null>(null);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback((returnFocus: boolean) => {
    setOpen(null);
    if (returnFocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const list = open ? (typeof items === 'function' ? items() : items) : [];

  return (
    <div className={`ed-menubutton ed-menubutton--${align}`} ref={root}>
      <button
        ref={button}
        id={id}
        type="button"
        className={className ?? 'ed-btn'}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-label={ariaLabel}
        title={title}
        onClick={() => setOpen(open ? null : 'first')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(e.key === 'ArrowDown' ? 'first' : 'last');
          }
        }}
      >
        {label}
        {chevron && <ChevronDown className="ed-btn__chev" />}
      </button>
      {open && (
        <MenuList items={list} labelledBy={id} level={0} initialFocus={open} onClose={close} />
      )}
    </div>
  );
}
