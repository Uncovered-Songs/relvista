import { useState, type ReactElement } from 'react';
import { version } from '../../package.json';
import { detectMac, shortcutRows } from '../keyboard.js';
import { store } from '../state/store.js';
import { Modal } from './Modal.js';

const DOCS = new URL('../', new URL(import.meta.env.BASE_URL, 'https://x.invalid')).pathname;
const GITHUB = 'https://github.com/relvista/relvista';
/** Shipped next to the app by vite.config.ts (THIRD_PARTY_NOTICES.md at the repository root). */
const NOTICES = `${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`;

export function HelpDialog(props: { onClose(): void }): ReactElement {
  const mac = detectMac();
  const [hints, setHints] = useState(store.lintHints);
  return (
    <Modal title="relvista editor" size="large" onClose={props.onClose}>
      <p>
        Edit DBML on the left, see the diagram on the right. Files stay on your computer: nothing is
        uploaded, there is no account.
      </p>

      <h3 className="ed-help__h">Keyboard shortcuts</h3>
      <table className="ed-table">
        <thead>
          <tr>
            <th scope="col">Keys</th>
            <th scope="col">Action</th>
            <th scope="col">Where</th>
          </tr>
        </thead>
        <tbody>
          {shortcutRows(mac).map((r) => (
            <tr key={r.action}>
              <td>
                <kbd>{r.keys}</kbd>
              </td>
              <td>{r.action}</td>
              <td className="ed-muted">{r.where}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="ed-help__h">How saving works</h3>
      <ul className="ed-help__list">
        <li>
          <strong>Open folder</strong> is the best way to work: relvista reads and writes the layout
          file (<code>schema.dbml.layout.json</code>, table positions) next to your DBML without
          asking.
        </li>
        <li>
          Save writes your <code>.dbml</code> byte for byte as you left it: an unedited file is
          written back unchanged, and edited files keep their BOM and each untouched line's line
          ending. relvista never reformats your code.
        </li>
        <li>
          The layout file is written only after you move, pin, collapse or auto-layout tables. A
          file opened on its own asks once where to put it.
        </li>
        <li>
          Browsers without the File System Access API (Firefox, Safari) download the files instead.
        </li>
        <li>Everything is also autosaved in this browser and restored when you come back.</li>
      </ul>

      <h3 className="ed-help__h">Settings</h3>
      <label className="ed-check">
        <input
          type="checkbox"
          checked={hints}
          onChange={(e) => {
            setHints(e.target.checked);
            store.setLintHints(e.target.checked);
          }}
        />
        Show DBML lint hints (blue squiggles with quick fixes)
      </label>

      <h3 className="ed-help__h">Learn more</h3>
      <ul className="ed-help__links">
        <li>
          <a href="https://dbml.dbdiagram.io/docs/" target="_blank" rel="noreferrer">
            DBML language reference
          </a>
        </li>
        <li>
          <a href={`${DOCS}docs/layout-file`}>Layout file format</a>
        </li>
        <li>
          <a href={`${DOCS}docs/editor`}>Editor guide</a>
        </li>
        <li>
          <a href={GITHUB} target="_blank" rel="noreferrer">
            Source code on GitHub
          </a>{' '}
          (MIT)
        </li>
        <li>
          <a href={`${DOCS}third-party-notices`}>Licences</a> of the open-source packages in this
          editor (<a href={NOTICES}>plain text</a>)
        </li>
      </ul>
      <p className="ed-muted ed-small">
        <strong>relvista</strong> editor {version}. relvista is an independent open-source project,
        not affiliated with Holistics or dbdiagram.io. DBML is an open-source language by Holistics.
      </p>
    </Modal>
  );
}
