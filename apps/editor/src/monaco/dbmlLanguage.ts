/**
 * The DBML language for Monaco: the official grammar and language configuration from
 * `@dbml/parse` (the ones dbdiagram uses). If a gap is ever found, extend a structured clone of the
 * official grammar here — never fork it wholesale.
 */
import { dbmlLanguageConfig, dbmlMonarchTokensProvider } from '@dbml/parse';
import type * as Monaco from 'monaco-editor/editor/editor.api';

export const DBML_LANGUAGE_ID = 'dbml';

export const dbmlMonarch =
  dbmlMonarchTokensProvider as unknown as Monaco.languages.IMonarchLanguage;
export const dbmlConfig = dbmlLanguageConfig as unknown as Monaco.languages.LanguageConfiguration;

let registered = false;

/** Registers 'dbml' once (idempotent). */
export function registerDbmlLanguage(m: typeof Monaco): void {
  if (registered) return;
  registered = true;
  m.languages.register({ id: DBML_LANGUAGE_ID, extensions: ['.dbml'], aliases: ['DBML', 'dbml'] });
  m.languages.setMonarchTokensProvider(DBML_LANGUAGE_ID, dbmlMonarch);
  m.languages.setLanguageConfiguration(DBML_LANGUAGE_ID, dbmlConfig);
}
