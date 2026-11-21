/**
 * Monaco bootstrap (decision 0004): editor API + editor features, no bundled languages, one
 * editor worker. Imported once, for its side effects, by main.tsx.
 */
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/features/register.all';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { registerDbmlLanguage } from './dbmlLanguage.js';
import { MONACO_THEME, themeData } from './themes.js';

globalThis.MonacoEnvironment = { getWorker: () => new EditorWorker() };

registerDbmlLanguage(monaco);
monaco.editor.defineTheme(MONACO_THEME.light, themeData('light'));
monaco.editor.defineTheme(MONACO_THEME.dark, themeData('dark'));

export { monaco };
