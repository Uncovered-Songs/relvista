// Browser-safe and light: the change list under a schema diff (docs/design/phase3-v1.md §5.3).
import type { ReactNode } from 'react';
import styles from './styles.module.css';

/** What changed, as `formatDiff` (`@relvista/core`) writes it, plus its counts. */
export interface DiffChanges {
  /** Top-level entries (tables, refs, enums, groups, notes, views, project). */
  summary: { added: number; removed: number; changed: number };
  /** One change per line: "+ table billing.invoices", "~ users.email: varchar → text". */
  lines: string[];
}

/** The problem shown for a diff without one of its versions. */
export function missingMessage(which: 'old' | 'new'): string {
  return `DbmlDiff needs the ${which} version: \`${which}\` or \`${which}Src\` (in a \`dbml-diff\` fence, the two versions separated by a line \`---\`).`;
}

/** U+2212 MINUS SIGN, as in the viewer's legend. */
const MINUS = '−';

/** "+3 −1 ~4", zero parts left out; '' when nothing changed. */
export function changeBadge({ added, removed, changed }: DiffChanges['summary']): string {
  return [
    added ? `+${added}` : '',
    removed ? `${MINUS}${removed}` : '',
    changed ? `~${changed}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** "3 added, 1 removed, 4 changed" for assistive technology. */
function spokenSummary({ added, removed, changed }: DiffChanges['summary']): string {
  return `${added} added, ${removed} removed, ${changed} changed`;
}

const TONES = { '+': 'added', '-': 'removed', '~': 'changed' } as const;
const WORDS = { added: 'Added', removed: 'Removed', changed: 'Changed' } as const;

/** Lists open by default up to this many lines. */
const OPEN_MAX = 8;

/**
 * `<details>` "Changes (+3 −1 ~4)" with one item per change, toned added / removed / changed. Drawn
 * at build time too, so it is in the page without JavaScript.
 */
export function ChangeList({ changes }: { changes: DiffChanges }): ReactNode {
  const badge = changeBadge(changes.summary);
  const empty = changes.lines.length === 0;
  return (
    <details
      className={`relvista-diff-changes ${styles.changes}`}
      {...(changes.lines.length <= OPEN_MAX ? { open: true } : {})}
    >
      <summary className={styles.changesSummary}>
        <span aria-hidden="true">{empty ? 'Changes (none)' : `Changes (${badge})`}</span>
        <span className={styles.srOnly}>
          {empty ? 'No changes' : `Changes: ${spokenSummary(changes.summary)}`}
        </span>
      </summary>
      {empty ? (
        <p className={styles.changesEmpty}>The two versions describe the same schema.</p>
      ) : (
        <ul className={styles.changesList}>
          {changes.lines.map((line, i) => {
            const sign = line.charAt(0) as keyof typeof TONES;
            const tone = TONES[sign] ?? 'changed';
            const text = TONES[sign] ? line.slice(1).trimStart() : line;
            return (
              <li key={i} data-rv-change={tone} className={styles.change}>
                <span className={styles.sign} aria-hidden="true">
                  {sign === '-' ? MINUS : sign in TONES ? sign : '~'}
                </span>
                <span className={styles.srOnly}>{WORDS[tone]}: </span>
                <code>{text}</code>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
