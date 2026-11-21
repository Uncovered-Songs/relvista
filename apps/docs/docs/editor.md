---
sidebar_position: 1.5
title: Editor
description: Edit DBML files in the browser with a live, editable ER diagram. Files stay on your disk.
---

The **relvista editor** is a DBML code editor with a live entity-relationship diagram next to it.
It runs entirely in your browser: there is no account and no server, and your files never leave
your machine.

**[Open the editor →](pathname:///editor/)**

## What it does

- **Code:** syntax highlighting, live errors and warnings, completion, hover, go to definition,
  find references and quick fixes for DBML, powered by the official `@dbml/parse`. Projects split
  over several files with `use` / `reuse` open as tabs.
- **Diagram:** updates as you type and keeps the last valid diagram while the code has an error.
  Drag tables, sticky notes and whole table groups; Shift+click or Shift+drag to select several;
  pin or collapse a table from its context menu; auto-layout everything that is not pinned.
  Click a table to jump to its code; put the cursor in a block to highlight its node.
- **Views:** every `DiagramView` in the file has its own layout. Pick one in the toolbar.
- **Export:** SVG, PNG, print / PDF, the DBML file, the layout JSON, and SQL for PostgreSQL,
  MySQL, SQL Server and Oracle. **New ▸ From SQL** imports a SQL schema.
- **Light and dark themes**, shared with this site. Works on a phone: below 768 px the code and the
  diagram become two tabs.

## Files and the layout sidecar

DBML cannot store table positions, so the editor keeps them in a small file next to your schema:
`schema.dbml` gets `schema.dbml.layout.json` (the [layout file](./layout-file.md) the Docusaurus
plugin reads too). It is written only after you change the layout: opening and saving a file never
creates one.

**Open folder** is the best way to work. The editor then reads and writes the sidecar silently, and
multi-file projects resolve their `use` imports. The entry file is `main.dbml` if there is one,
otherwise the only `.dbml` file at the top, otherwise you pick it. When you open a single file
instead, the first save that needs a sidecar asks you once where to put it.

You can also open a file from a URL, drop files on the window, or start from one of the
[gallery examples](./gallery/index.mdx).

### Opening a URL

**Open › Open from URL…** or a link to the editor with `?url=` downloads a `.dbml` file from any
server that allows cross-origin requests (CORS); GitHub `blob` links are rewritten to their raw
file. Only the `.dbml` file is requested unless you ask for its layout too, because probing for a
layout file that does not exist shows up as a 404 error in the browser console:

| Link                                                | Layout                                                    |
| --------------------------------------------------- | --------------------------------------------------------- |
| `/relvista/editor/?url=<file>`                      | none: tables are placed automatically                     |
| `/relvista/editor/?url=<file>&layout`               | `<file>.layout.json` next to it, if there is one          |
| `/relvista/editor/?url=<file>&layout=<layout file>` | that file (a full URL, or a path relative to the `.dbml`) |

In the dialog, **Also load its layout file** does the same as `&layout`. Encode the file URL
(`encodeURIComponent`) when it has its own query string.

## Saving guarantees

relvista never reformats your file. A file you open and save unchanged is written back **byte for
byte**. When you edit it, only the lines you changed change: the byte order mark, CRLF, LF or mixed
line endings and the presence of a final newline are kept. Every example in the repository is
checked this way, in twelve variants (line endings, BOM, tabs, trailing whitespace, unicode), on
every commit, together with a hand-written file that uses every DBML feature and edge cases such as
empty files and a lone CR.

Your work is also autosaved in the browser (IndexedDB). Reloading the page brings back the text,
the layout and the view; **Open ▸ Restore previous session** goes one step further back. If you try
to leave with unsaved changes, the browser asks first.

## Share links

**Share** copies a link that contains the whole schema, compressed into the part of the URL after
`#`, plus the layout and the current view if you want. The link is never sent to a server: whoever
opens it gets the diagram straight from the URL. Very large schemas make long links; past a few
megabytes, save the file instead. A link carries one file, so for multi-file projects it shares the
entry file only.

Every diagram in these docs has an **Open in editor** button that does the same thing.

## Keyboard shortcuts

Mod is <kbd>Cmd</kbd> on macOS and <kbd>Ctrl</kbd> elsewhere. Press <kbd>?</kbd> in the editor for
the full list.

| Keys                                                                       | Action                                          |
| -------------------------------------------------------------------------- | ----------------------------------------------- |
| <kbd>Mod</kbd>+<kbd>S</kbd>                                                | Save                                            |
| <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>                               | Save as (Save folder as… for a folder)          |
| <kbd>Mod</kbd>+<kbd>O</kbd>                                                | Open file                                       |
| <kbd>Mod</kbd>+<kbd>Z</kbd> / <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Undo / redo (text in the code, else layout)     |
| <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd>                                 | Auto-layout (keeps pinned tables)               |
| <kbd>Alt</kbd>+<kbd>1</kbd> / <kbd>Alt</kbd>+<kbd>2</kbd>                  | Focus the code / the diagram                    |
| Arrows (<kbd>Shift</kbd>: 1 px)                                            | Move the selected tables (diagram focused)      |
| <kbd>Enter</kbd>                                                           | Show the focused table's code (diagram focused) |
| <kbd>Shift</kbd>+<kbd>1</kbd>, <kbd>+</kbd>, <kbd>−</kbd>                  | Fit, zoom in, zoom out (diagram focused)        |

## Browser support

| Browser                    | Open and save                                                             |
| -------------------------- | ------------------------------------------------------------------------- |
| Chrome, Edge, Opera, Brave | Saves straight back to your files (File System Access API); recent files. |
| Firefox, Safari            | Opens through the file picker; **Save** downloads the file (same bytes).  |

Everything else (editing, diagram, share links, export) works the same in every current browser.
