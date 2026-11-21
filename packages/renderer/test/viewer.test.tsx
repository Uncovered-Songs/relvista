// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DbmlViewer } from '../src/viewer/DbmlViewer.js';
import { createEditorLink, decodeShareHash, entrySource } from '../src/share/index.js';
import { parseHandleId, handleId } from '../src/viewer/context.js';
import { loadExamples } from './examples.js';

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO);
  if (!('DOMMatrixReadOnly' in globalThis)) {
    class M {
      m22 = 1;
      constructor(_t?: string) {}
    }
    vi.stubGlobal('DOMMatrixReadOnly', M);
  }
});

afterEach(() => cleanup());

const GOOD = `
Table users {
  id integer [pk]
  email varchar [not null, unique]
}
Table posts {
  id integer [pk]
  user_id integer [ref: > users.id]
}
DiagramView only_users { Tables { users } }
`;

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe('DbmlViewer', () => {
  it('renders without throwing', async () => {
    const onDiagnostics = vi.fn();
    const { container } = render(
      <DbmlViewer source={GOOD} title="Blog" height={400} onDiagnostics={onDiagnostics} />,
    );
    await flush();
    const root = container.querySelector('.rv-viewer') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.getAttribute('data-rv-color-mode')).toBe('light');
    expect(root.style.height).toBe('400px');
    expect(screen.getByText('Blog')).toBeTruthy();
    expect(screen.getByRole('toolbar')).toBeTruthy();
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
    expect(screen.getByLabelText('Diagram view')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onDiagnostics).toHaveBeenCalledWith([]);
  });

  it('shows an error banner with line:column and keeps the last good diagram', async () => {
    const { container, rerender } = render(<DbmlViewer source={GOOD} />);
    await flush();
    rerender(<DbmlViewer source={'Table users {\n  id integer [pk\n}'} />);
    await flush();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/last valid diagram/);
    expect(alert.textContent).toMatch(/\b\d+:\d+\b/);
    expect(container.querySelector('.rv-empty')).toBeNull();
  });

  it('shows the banner and an empty state when the first source is invalid', async () => {
    const { container } = render(<DbmlViewer source="Table {" colorMode="dark" />);
    await flush();
    expect(screen.getByRole('alert').textContent).toMatch(/\d+:\d+/);
    expect(container.querySelector('.rv-empty')).not.toBeNull();
    expect(container.querySelector('[data-rv-color-mode="dark"]')).not.toBeNull();
  });

  it('opens the export menu and offers an editor link', async () => {
    render(<DbmlViewer source={GOOD} editorUrl="https://example.org/editor/#old" />);
    await flush();
    fireEvent.click(screen.getByLabelText('Export'));
    expect(screen.getByText('Download SVG')).toBeTruthy();
    expect(screen.getByText('Download PNG')).toBeTruthy();
    // The link is encoded asynchronously (compression): wait for it under load.
    const link = (await screen.findByLabelText('Open in editor')) as HTMLAnchorElement;
    expect(link.href.startsWith('https://example.org/editor/#dbml=')).toBe(true);
    expect((await decodeShareHash(link.hash))?.dbml).toBe(GOOD);
  });

  it('switches views and falls back to the overlay for fullscreen', async () => {
    const { container } = render(<DbmlViewer source={GOOD} toolbar={['view', 'fullscreen']} />);
    await flush();
    const select = screen.getByLabelText('Diagram view') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'only_users' } });
    await flush();
    expect(select.value).toBe('only_users');
    fireEvent.click(screen.getByLabelText('Fullscreen'));
    await flush();
    expect(container.querySelector('.rv-viewer--overlay')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(container.querySelector('.rv-viewer--overlay')).toBeNull();
  });

  // 14-large takes a while to lay out on a busy CI runner.
  it.each(loadExamples())('renders example %s', { timeout: 30_000 }, async (_name, input) => {
    const onDiagnostics = vi.fn();
    render(<DbmlViewer source={input} onDiagnostics={onDiagnostics} />);
    await flush();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('viewer helpers', () => {
  it('builds editor links', async () => {
    const link = await createEditorLink('https://x.dev/e', { dbml: 'Table a {}' });
    expect(link).toMatch(/^https:\/\/x\.dev\/e#dbml=[A-Za-z0-9_-]+$/);
    expect((await decodeShareHash(new URL(link).hash))?.dbml).toBe('Table a {}');
    const multi = { files: { 'm.dbml': 'x' }, entry: 'm.dbml' };
    const replaced = await createEditorLink('https://x.dev/e#q', { dbml: entrySource(multi) });
    expect(replaced.startsWith('https://x.dev/e#dbml=')).toBe(true);
    expect((await decodeShareHash(replaced.slice(replaced.indexOf('#'))))?.dbml).toBe('x');
  });

  it('round-trips handle ids', () => {
    expect(parseHandleId(handleId(3, 'left', 'source'))).toEqual({
      row: 3,
      side: 'left',
      type: 'source',
    });
    expect(parseHandleId(handleId(-1, 'right', 'target'))).toEqual({
      row: -1,
      side: 'right',
      type: 'target',
    });
  });
});
