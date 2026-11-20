// @vitest-environment jsdom
// DbmlDiagram in a browser-like environment: loading, fetch errors, invalid layout files, the
// error boundary and the Source tab. Docusaurus modules are replaced by minimal stand-ins.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sourceText } from '../src/source.js';

const viewerProps: Array<Record<string, unknown>> = [];
let viewerThrows = false;
vi.mock('@relvista/renderer', () => ({
  DbmlViewer: (p: Record<string, unknown>) => {
    viewerProps.push(p);
    if (viewerThrows) throw new Error('boom');
    return <div data-testid="viewer" />;
  },
}));

const { default: DbmlDiagram } = await import('../src/theme/DbmlDiagram/index.js');

beforeAll(() => {
  if (!('MutationObserver' in globalThis)) vi.stubGlobal('MutationObserver', class {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  viewerProps.length = 0;
  viewerThrows = false;
});

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 10));
  });
}

function stubFetch(map: Record<string, { status: number; body: string }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const r = map[url] ?? { status: 404, body: '' };
      return {
        ok: r.status < 400,
        status: r.status,
        statusText: r.status < 400 ? 'OK' : 'Not Found',
        text: async () => r.body,
      };
    }),
  );
}

describe('DbmlDiagram', () => {
  it('renders the viewer for an inline value, with the ELK worker URL', async () => {
    render(<DbmlDiagram value={'Table a {\n  id int\n}'} title="A" />);
    await settle();
    expect(screen.getByTestId('viewer')).toBeTruthy();
    expect(viewerProps.at(-1)!['workerUrl']).toBe('/elk-worker.js');
    expect(viewerProps.at(-1)!['minimap']).toBe('auto');
  });

  it('shows a loading placeholder, then the fetched source', async () => {
    stubFetch({ '/s.dbml': { status: 200, body: 'Table a {\n  id int\n}' } });
    render(<DbmlDiagram src="/s.dbml" title="Fetched" />);
    expect(screen.getByText('Loading diagram…')).toBeTruthy();
    await settle();
    expect(screen.getByTestId('viewer')).toBeTruthy();
    expect(viewerProps.at(-1)!['source']).toContain('Table a');
  });

  it('reports a source that cannot be fetched', async () => {
    stubFetch({});
    render(<DbmlDiagram src="/missing.dbml" />);
    await settle();
    expect(screen.getByRole('alert').textContent).toMatch(/Could not load \/missing\.dbml: 404/);
  });

  it('reports an invalid layout file', async () => {
    stubFetch({ '/bad.layout.json': { status: 200, body: '{"version": "nope"}' } });
    render(<DbmlDiagram value={'Table a {\n  id int\n}'} layout="/bad.layout.json" />);
    // Validation loads @relvista/core lazily.
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert.textContent).toMatch(/Invalid layout file/);
  });

  it('catches a crashing viewer in its error boundary', async () => {
    viewerThrows = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<DbmlDiagram value={'Table a {\n  id int\n}'} />);
    await settle();
    expect(screen.getByRole('alert').textContent).toMatch(/could not be rendered.*boom/);
    err.mockRestore();
  });

  it('shows every file of a multi-file project in the Source tab', async () => {
    render(
      <DbmlDiagram
        source
        value={{
          files: { 'main.dbml': 'use * from ./b', 'b.dbml': 'Table b {}' },
          entry: 'main.dbml',
        }}
      />,
    );
    await settle();
    expect(screen.getByTestId('code').textContent).toBe(
      '// main.dbml\nuse * from ./b\n\n// b.dbml\nTable b {}\n',
    );
  });
});

describe('sourceText', () => {
  it('returns single sources unchanged', () => {
    expect(sourceText('Table a {}')).toBe('Table a {}');
    expect(sourceText({ files: { 'm.dbml': 'x' }, entry: 'm.dbml' })).toBe('x');
  });
});
