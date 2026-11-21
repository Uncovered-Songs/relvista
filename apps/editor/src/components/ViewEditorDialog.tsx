/**
 * New view / Edit view… (design phase3 §6.7): the name, and what the view shows as checkbox
 * trees: Tables (by schema), Groups, Notes, Schemas, with "All tables" (`Tables { * }`) and
 * "All notes" (`Notes { * }`). Writes through the store (`syncViews`), never by hand.
 */
import { useId, useMemo, useState, type ReactElement } from 'react';
import type { DiagramModel } from '@relvista/core';
import { viewNameProblem, type ViewDefinition } from '../diagram/views.js';
import { store, useEditor, type ViewEditorState } from '../state/store.js';
import { Modal } from './Modal.js';
import './editing.css';

function toggle(list: string[], id: string, on: boolean): string[] {
  return on ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id);
}

function Check(props: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  hint?: string;
  onChange(on: boolean): void;
}): ReactElement {
  return (
    <label className={`ed-check ed-viewtree__check${props.disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        ref={(el) => {
          if (el) el.indeterminate = props.indeterminate === true;
        }}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{props.label}</span>
      {props.hint && <span className="ed-viewtree__hint">{props.hint}</span>}
    </label>
  );
}

function Section(props: { title: string; children: ReactElement | ReactElement[] }): ReactElement {
  const id = useId();
  return (
    <fieldset className="ed-viewtree__section" aria-labelledby={id}>
      <legend id={id} className="ed-viewtree__legend">
        {props.title}
      </legend>
      {props.children}
    </fieldset>
  );
}

function schemasOf(model: DiagramModel): string[] {
  return [...new Set(model.tables.map((t) => t.schema))];
}

export function ViewEditorDialog(props: { state: ViewEditorState }): ReactElement | null {
  const { state } = props;
  const model = useEditor((s) => s.compile.model);
  const [name, setName] = useState(state.name);
  const [d, setD] = useState<ViewDefinition>(state.initial);
  const [tried, setTried] = useState(false);
  const nameId = useId();
  const errId = useId();
  const views = model?.views ?? [];
  const problem = viewNameProblem(name, views, state.mode === 'edit' ? state.name : undefined);
  const schemas = useMemo(() => (model ? schemasOf(model) : []), [model]);
  const multiSchema = schemas.length > 1;
  if (!model) return null;

  const close = () => store.closeViewEditor();
  const submit = () => {
    setTried(true);
    if (problem) return;
    const ok =
      state.mode === 'create' ? store.createView(name, d) : store.updateView(state.name, name, d);
    if (ok) close();
  };
  const set = (patch: Partial<ViewDefinition>) => setD((x) => ({ ...x, ...patch }));
  const byTables = !d.allTables;

  return (
    <Modal
      title={state.mode === 'create' ? 'New view' : `Edit view ${state.name}`}
      onClose={close}
      size="medium"
      className="ed-viewdialog"
      initialFocus="input[name='view-name']"
      footer={
        <>
          <button type="button" className="ed-btn" onClick={close}>
            Cancel
          </button>
          <button type="button" className="ed-btn ed-btn--primary" onClick={submit}>
            {state.mode === 'create' ? 'Create view' : 'Save view'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="ed-field">
          <label className="ed-field__label" htmlFor={nameId}>
            Name
          </label>
          <input
            id={nameId}
            name="view-name"
            className="ed-input"
            value={name}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={tried && !!problem}
            aria-describedby={tried && problem ? errId : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {tried && problem && (
            <span id={errId} className="ed-viewtree__error" role="alert">
              {problem}
            </span>
          )}
        </div>
        <div className="ed-viewtree">
          <Section title="Tables">
            <Check
              label="All tables"
              hint="Tables { * }"
              checked={d.allTables}
              onChange={(on) => set({ allTables: on })}
            />
            <div className="ed-viewtree__list">
              {schemas.map((schema) => {
                const tables = model.tables.filter((t) => t.schema === schema);
                const on = tables.filter((t) => d.allTables || d.tables.includes(t.id)).length;
                const rows = tables.map((t) => (
                  <Check
                    key={t.id}
                    label={t.name}
                    checked={d.allTables || d.tables.includes(t.id)}
                    disabled={!byTables}
                    onChange={(v) => set({ tables: toggle(d.tables, t.id, v) })}
                  />
                ));
                if (!multiSchema)
                  return (
                    <div key={schema} className="ed-viewtree__rows">
                      {rows}
                    </div>
                  );
                return (
                  <div key={schema} className="ed-viewtree__group">
                    <Check
                      label={schema}
                      checked={on === tables.length}
                      indeterminate={on > 0 && on < tables.length}
                      disabled={!byTables}
                      onChange={(v) =>
                        set({
                          tables: tables.reduce((acc, t) => toggle(acc, t.id, v), d.tables),
                        })
                      }
                    />
                    <div className="ed-viewtree__children">{rows}</div>
                  </div>
                );
              })}
            </div>
          </Section>
          {model.groups.length > 0 && (
            <Section title="Groups">
              <div className="ed-viewtree__list">
                {model.groups.map((g) => (
                  <Check
                    key={g.id}
                    label={g.name}
                    hint={`${g.tableIds.length} table${g.tableIds.length === 1 ? '' : 's'}`}
                    checked={d.allTables || d.groups.includes(g.id)}
                    disabled={!byTables}
                    onChange={(v) => set({ groups: toggle(d.groups, g.id, v) })}
                  />
                ))}
              </div>
            </Section>
          )}
          {model.stickyNotes.length > 0 && (
            <Section title="Notes">
              <Check
                label="All notes"
                hint="Notes { * }"
                checked={d.allNotes}
                onChange={(on) => set({ allNotes: on })}
              />
              <div className="ed-viewtree__list">
                {model.stickyNotes.map((n) => (
                  <Check
                    key={n.id}
                    label={n.name}
                    checked={d.allNotes || d.notes.includes(n.id)}
                    disabled={d.allNotes}
                    onChange={(v) => set({ notes: toggle(d.notes, n.id, v) })}
                  />
                ))}
              </div>
            </Section>
          )}
          {(multiSchema || d.schemas.length > 0) && (
            <Section title="Schemas">
              <div className="ed-viewtree__list">
                {schemas.map((s) => (
                  <Check
                    key={s}
                    label={s}
                    hint="every table of the schema"
                    checked={d.allTables || d.schemas.includes(s)}
                    disabled={!byTables}
                    onChange={(v) => set({ schemas: toggle(d.schemas, s, v) })}
                  />
                ))}
              </div>
            </Section>
          )}
        </div>
        {/* Enter in the name field submits. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
