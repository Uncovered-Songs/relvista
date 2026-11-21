import './monaco/setup.js';
import '@relvista/renderer/styles.css';
import './styles/tokens.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { createDbmlLanguageService } from './monaco/languageService.js';
import { monaco } from './monaco/setup.js';
import { revealRange } from './diagram/sync.js';
import { store } from './state/store.js';
import { initTheme } from './theme.js';

initTheme();

store.attachLanguageService(
  createDbmlLanguageService(monaco, {
    getModel: () => store.getState().compile.model,
    openFile: (key, range) =>
      revealRange(
        key,
        range ?? { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
        {
          focus: true,
          flash: false,
        },
      ),
  }),
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void store.init();
