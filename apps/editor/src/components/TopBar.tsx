import type { ReactElement } from 'react';
import { baseName } from '../files/folder.js';
import { hasFsa } from '../files/fsAccess.js';
import { cycleTheme, setTheme, useTheme, type ThemeChoice } from '../theme.js';
import { store, useEditor } from '../state/store.js';
import { AutoLayoutMenu, autoLayoutItems } from './AutoLayoutMenu.js';
import { ExportMenu, exportMenuItems } from './ExportMenu.js';
import { FileMenu, openMenuItems } from './FileMenu.js';
import {
  HelpIcon,
  Logo,
  MoonIcon,
  MoreIcon,
  SaveIcon,
  ShareIcon,
  SunIcon,
  SystemIcon,
} from './icons.js';
import { MenuButton, type MenuItem } from './Menu.js';
import { NewMenu, newMenuItems } from './NewMenu.js';
import { mod } from './shortcutLabel.js';
import { useCompactTopbar, useNarrow } from './useNarrow.js';
import { ViewSelect, viewItems } from './ViewSelect.js';

const DOCS_URL = new URL('../', new URL(import.meta.env.BASE_URL, 'https://x.invalid')).pathname;

const ORIGIN_LABEL: Record<string, string> = {
  untitled: 'New document, not saved to a file yet',
  file: 'File on this computer',
  folder: 'Folder on this computer',
  url: 'Opened from a URL (Save writes a copy)',
  share: 'Opened from a share link (Save writes a copy)',
  example: 'Example (Save writes a copy)',
  sql: 'Converted from SQL, not saved to a file yet',
};

const THEME_LABEL: Record<ThemeChoice, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

function ThemeIcon({ choice }: { choice: ThemeChoice }): ReactElement {
  return choice === 'light' ? <SunIcon /> : choice === 'dark' ? <MoonIcon /> : <SystemIcon />;
}

function FileName(): ReactElement {
  const name = useEditor((s) => s.ws.name);
  const origin = useEditor((s) => s.ws.origin);
  const dirty = useEditor((s) => store.isDirty(s));
  const display = baseName(name);
  return (
    <div className="ed-filename" title={`${name} — ${ORIGIN_LABEL[origin] ?? ''}`}>
      <span className="ed-filename__name">{display}</span>
      {dirty && (
        <span
          className="ed-filename__dot"
          role="img"
          aria-label="Unsaved changes"
          title="Unsaved changes"
        >
          ●
        </span>
      )}
    </div>
  );
}

function SaveButtons({ withSaveAs }: { withSaveAs: boolean }): ReactElement {
  const dirty = useEditor((s) => store.isDirty(s));
  const saving = useEditor((s) => s.saving);
  const hasHandle = useEditor((s) =>
    s.ws.files.some((f) => f.key === s.ws.entry && f.handle !== null),
  );
  const fsa = hasFsa();
  return (
    <>
      <button
        type="button"
        className="ed-btn"
        disabled={saving || (!dirty && hasHandle && fsa)}
        onClick={() => void store.save()}
        aria-label="Save"
        title={`Save (${mod('S')})${fsa ? '' : ' — downloads the file in this browser'}`}
      >
        <SaveIcon />
        <span className="ed-btn__text">Save</span>
      </button>
      {withSaveAs && (
        <button
          type="button"
          className="ed-btn"
          disabled={saving}
          onClick={() => void store.saveAs()}
          title={`Save as (${mod('S', { shift: true })})`}
        >
          Save as
        </button>
      )}
    </>
  );
}

function saveAsItem(): MenuItem {
  return {
    id: 'm-saveas',
    label: 'Save as…',
    shortcut: mod('S', { shift: true }),
    disabled: store.getState().saving,
    onSelect: () => void store.saveAs(),
  };
}

function viewMenuItem(): MenuItem[] {
  const views = viewItems();
  return views.length ? [{ id: 'm-view', label: 'View', submenu: views }] : [];
}

/** The ⋯ menu of the middle-width top bar: what does not fit next to the main buttons. */
function compactItems(): MenuItem[] {
  return [
    saveAsItem(),
    { id: 'm-layout', label: 'Auto-layout', submenu: autoLayoutItems() },
    ...viewMenuItem(),
  ];
}

/** The ⋯ menu of the phone top bar: everything but Save and Share. */
function overflowItems(choice: ThemeChoice): MenuItem[] {
  const items: MenuItem[] = [
    { id: 'm-new', label: 'New', submenu: newMenuItems() },
    { id: 'm-open', label: 'Open', submenu: openMenuItems() },
    saveAsItem(),
    { id: 'm-export', label: 'Export', submenu: exportMenuItems() },
    { id: 'm-layout', label: 'Auto-layout', submenu: autoLayoutItems() },
    ...viewMenuItem(),
  ];
  items.push(
    {
      id: 'm-theme',
      label: 'Theme',
      separator: true,
      submenu: (['system', 'light', 'dark'] as const).map((t) => ({
        id: `t-${t}`,
        label: THEME_LABEL[t],
        checked: choice === t,
        onSelect: () => setTheme(t),
      })),
    },
    {
      id: 'm-help',
      label: 'Help and shortcuts',
      onSelect: () => store.openDialog({ kind: 'help' }),
    },
  );
  return items;
}

function ShareButton({ iconOnly }: { iconOnly: boolean }): ReactElement {
  return (
    <button
      type="button"
      className={iconOnly ? 'ed-iconbtn' : 'ed-btn'}
      onClick={() => store.openDialog({ kind: 'share' })}
      aria-label="Share"
      title="Share a link"
    >
      <ShareIcon />
      {!iconOnly && <span className="ed-btn__text">Share</span>}
    </button>
  );
}

function EndButtons({ choice }: { choice: ThemeChoice }): ReactElement {
  return (
    <>
      <button
        type="button"
        className="ed-iconbtn"
        onClick={() => cycleTheme()}
        aria-label={`${THEME_LABEL[choice]} (click to change)`}
        title={`${THEME_LABEL[choice]} — click to change`}
      >
        <ThemeIcon choice={choice} />
      </button>
      <button
        type="button"
        className="ed-iconbtn"
        onClick={() => store.openDialog({ kind: 'help' })}
        aria-label="Help and shortcuts"
        title="Help and shortcuts (?)"
      >
        <HelpIcon />
      </button>
    </>
  );
}

/**
 * Three widths: phones (< 768 px) get Save, Share and a ⋯ menu; the middle width (< 1180 px:
 * tablets, narrow windows) keeps New, Open, Save, Share (icon) and Export and moves Save as,
 * Auto-layout and View into ⋯; wide windows show everything.
 */
export function TopBar(): ReactElement {
  const narrow = useNarrow();
  const compact = useCompactTopbar();
  const { choice } = useTheme();
  // Re-render menus when the model or workspace changes (disabled states).
  useEditor((s) => s.compile);
  useEditor((s) => s.ws.files.length);

  return (
    <header className="ed-topbar">
      <a className="ed-logo" href={DOCS_URL} title="relvista docs">
        <Logo />
        <span className="ed-logo__text">relvista</span>
      </a>
      <FileName />
      {narrow ? (
        <div className="ed-topbar__actions">
          <SaveButtons withSaveAs={false} />
          <ShareButton iconOnly={false} />
          <MenuButton
            label={<MoreIcon />}
            ariaLabel="More actions"
            className="ed-iconbtn ed-iconbtn--bordered"
            chevron={false}
            align="right"
            items={() => overflowItems(choice)}
          />
        </div>
      ) : (
        <>
          <nav className="ed-topbar__menus" aria-label="Document">
            <NewMenu />
            <FileMenu />
            <SaveButtons withSaveAs={!compact} />
            <span className="ed-topbar__sep" aria-hidden="true" />
            <ShareButton iconOnly={compact} />
            <ExportMenu />
            {!compact && <AutoLayoutMenu />}
          </nav>
          <div className="ed-topbar__end">
            {compact ? (
              <MenuButton
                label={<MoreIcon />}
                ariaLabel="More actions"
                title="Save as, Auto-layout, View"
                className="ed-iconbtn"
                chevron={false}
                align="right"
                items={compactItems}
              />
            ) : (
              <ViewSelect />
            )}
            <EndButtons choice={choice} />
          </div>
        </>
      )}
    </header>
  );
}
