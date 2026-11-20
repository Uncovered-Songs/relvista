import { DEFAULT_VIEW } from '@relvista/core';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import {
  ChevronIcon,
  CollapseIcon,
  DownloadIcon,
  ExpandIcon,
  ExternalIcon,
  FitIcon,
  LayersIcon,
  PrintIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons.js';

export type ToolbarItem =
  'zoom' | 'fit' | 'fullscreen' | 'export' | 'print' | 'view' | 'open-in-editor';

export const DEFAULT_TOOLBAR: ToolbarItem[] = [
  'view',
  'zoom',
  'fit',
  'fullscreen',
  'export',
  'print',
  'open-in-editor',
];

export type ExportKind = 'svg' | 'png';

export interface ToolbarProps {
  items: readonly ToolbarItem[];
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
  fullscreen: boolean;
  onToggleFullscreen(): void;
  onExport(kind: ExportKind): void;
  onPrint(): void;
  views: readonly string[];
  view: string;
  onViewChange(view: string): void;
  editorHref: string | null;
}

function Button({
  title,
  onClick,
  children,
  pressed,
  expanded,
  popup,
  buttonRef,
  item,
}: {
  title: string;
  onClick(): void;
  children: ReactNode;
  pressed?: boolean;
  expanded?: boolean;
  popup?: 'menu';
  buttonRef?: Ref<HTMLButtonElement>;
  /** Toolbar item this button belongs to (CSS hides some in narrow viewers). */
  item?: ToolbarItem;
}): ReactElement {
  return (
    <button
      ref={buttonRef}
      data-rv-item={item}
      type="button"
      className="rv-tb-button"
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={popup}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Toolbar(p: ToolbarProps): ReactElement {
  const has = (i: ToolbarItem) => p.items.includes(i);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const exportButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menu) return;
    // Focus the first item when the menu opens (keyboard users land in it).
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onMouse = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as globalThis.Node)) return;
      setMenu(false);
    };
    // Capture phase, so the menu sees Esc before the fullscreen overlay does; preventDefault
    // tells the overlay this press is taken (one layer closes per press).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setMenu(false);
      exportButton.current?.focus();
    };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menu]);

  /** Arrow keys / Home / End move between menu items. */
  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Tab') setMenu(false);
    if (next >= 0) {
      e.preventDefault();
      items[next]!.focus();
    }
  };

  const groups: ReactNode[] = [];
  if (has('view') && p.views.length > 0) {
    groups.push(
      <label key="view" className="rv-tb-select" title="Diagram view">
        <LayersIcon />
        <select
          aria-label="Diagram view"
          value={p.view}
          onChange={(e) => p.onViewChange(e.target.value)}
        >
          <option value={DEFAULT_VIEW}>All tables</option>
          {p.views.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <ChevronIcon />
      </label>,
    );
  }
  const nav: ReactNode[] = [];
  if (has('zoom')) {
    nav.push(
      <Button key="zi" title="Zoom in" item="zoom" onClick={p.onZoomIn}>
        <ZoomInIcon />
      </Button>,
      <Button key="zo" title="Zoom out" item="zoom" onClick={p.onZoomOut}>
        <ZoomOutIcon />
      </Button>,
    );
  }
  if (has('fit')) {
    nav.push(
      <Button key="fit" title="Fit to view" onClick={p.onFit}>
        <FitIcon />
      </Button>,
    );
  }
  if (has('fullscreen')) {
    nav.push(
      <Button
        key="fs"
        title={p.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        pressed={p.fullscreen}
        onClick={p.onToggleFullscreen}
      >
        {p.fullscreen ? <CollapseIcon /> : <ExpandIcon />}
      </Button>,
    );
  }
  if (nav.length)
    groups.push(
      <div key="nav" className="rv-tb-group">
        {nav}
      </div>,
    );

  const out: ReactNode[] = [];
  if (has('export')) {
    out.push(
      <div key="export" className="rv-tb-menu-wrap" ref={menuRef}>
        <Button
          title="Export"
          expanded={menu}
          popup="menu"
          buttonRef={exportButton}
          onClick={() => setMenu((m) => !m)}
        >
          <DownloadIcon />
        </Button>
        {menu ? (
          <div className="rv-tb-menu" role="menu" aria-label="Export" onKeyDown={onMenuKey}>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setMenu(false);
                p.onExport('svg');
              }}
            >
              Download SVG
            </button>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setMenu(false);
                p.onExport('png');
              }}
            >
              Download PNG
            </button>
          </div>
        ) : null}
      </div>,
    );
  }
  if (has('print')) {
    out.push(
      <Button key="print" title="Print" item="print" onClick={p.onPrint}>
        <PrintIcon />
      </Button>,
    );
  }
  if (has('open-in-editor') && p.editorHref) {
    out.push(
      <a
        key="edit"
        className="rv-tb-button"
        href={p.editorHref}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in editor"
        aria-label="Open in editor"
      >
        <ExternalIcon />
      </a>,
    );
  }
  if (out.length)
    groups.push(
      <div key="out" className="rv-tb-group">
        {out}
      </div>,
    );

  return (
    <div className="rv-toolbar nodrag nopan" role="toolbar" aria-label="Diagram tools">
      {groups}
    </div>
  );
}
