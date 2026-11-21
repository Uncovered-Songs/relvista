// @vitest-environment jsdom
// Per-diagram anchors and deep links (docs/design/phase3-v1.md §5.2): the default anchor is the
// same on the server and in the browser, `id` (prop and fence meta) wins, the location hash
// becomes the viewer's target, and only the diagram the hash names writes the viewer's state back
// into the URL (with replaceState).
import { PassThrough } from 'node:stream';
import { text } from 'node:stream/consumers';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Renderer from '@relvista/renderer';
import type { DiagramTarget } from '@relvista/renderer';
import { parseDbmlMeta } from '../src/meta.js';
import {
  anchorOfHash,
  diagramAnchor,
  fnv1aHex,
  resetServerAnchors,
  slugify,
  sourceIdentity,
} from '../src/theme/DbmlDiagram/anchor.js';
import { collected } from './stubs/useBrokenLinks.js';

type ViewerProps = Record<string, unknown> & {
  anchor?: string;
  target?: DiagramTarget | null;
  onTargetChange?: (t: DiagramTarget) => void;
  onLinkCopy?: (href: string, t: DiagramTarget) => void;
};
const viewers = new Map<string, ViewerProps>();
vi.mock('@relvista/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof Renderer>()),
  // React Flow does not run in jsdom: a stand-in that records its props per anchor.
  DbmlViewer: (p: ViewerProps) => {
    viewers.set(p.anchor ?? '', p);
    return <div className="rv-viewer" data-rv-layout="done" />;
  },
}));

const { default: DbmlDiagram } = await import('../src/theme/DbmlDiagram/index.js');
const { default: MDXCode } = await import('../src/theme/MDXComponents/Code/index.js');

const SOURCE =
  'Table users {\n  id int [pk]\n}\n\nTable orders {\n  user_id int [ref: > users.id]\n}';

async function serverHtml(app: ReactNode): Promise<string> {
  vi.stubGlobal('document', undefined);
  try {
    return await new Promise<string>((resolve, reject) => {
      const pass = new PassThrough();
      const { pipe } = renderToPipeableStream(app, {
        onError: reject,
        onAllReady() {
          pipe(pass);
          text(pass).then(resolve, reject);
        },
      });
    });
  } finally {
    vi.unstubAllGlobals();
  }
}

async function settle(ms = 60) {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, ms / 5));
  });
}

const scrolled: Element[] = [];
beforeAll(() => {
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
});
beforeEach(() => {
  history.replaceState(null, '', '/docs/page');
});
afterEach(() => {
  cleanup();
  viewers.clear();
  scrolled.length = 0;
  collected.anchors.length = 0;
});

describe('default anchors', () => {
  it('diagram-<slug of the title>, else diagram-<FNV-1a of source and view>', () => {
    expect(diagramAnchor({ title: 'Billing & invoices', source: SOURCE })).toBe(
      'diagram-billing-invoices',
    );
    expect(diagramAnchor({ title: 'Übersicht der Kunden', source: SOURCE })).toBe(
      'diagram-übersicht-der-kunden',
    );
    const plain = diagramAnchor({ source: SOURCE });
    expect(plain).toBe(`diagram-${fnv1aHex(SOURCE)}`);
    expect(plain).toMatch(/^diagram-[0-9a-f]{8}$/);
    expect(diagramAnchor({ source: SOURCE, view: 'billing' })).toBe(
      `diagram-${fnv1aHex(`${SOURCE}billing`)}`,
    );
    expect(diagramAnchor({ source: SOURCE, view: 'billing' })).not.toBe(plain);
    // A title with nothing sluggable falls back to the hash.
    expect(diagramAnchor({ title: '!!!', source: SOURCE })).toBe(plain);
    // `id` wins over everything.
    expect(diagramAnchor({ id: 'my-db', title: 'Billing', source: SOURCE })).toBe('my-db');
  });

  it('FNV-1a matches the reference values', () => {
    expect(fnv1aHex('')).toBe('811c9dc5');
    expect(fnv1aHex('a')).toBe('e40c292c');
    expect(fnv1aHex('foobar')).toBe('bf9cf968');
  });

  it('identity of multi-file projects and src files', () => {
    expect(sourceIdentity(undefined, '/dbml/shop.dbml')).toBe('/dbml/shop.dbml');
    expect(sourceIdentity({ files: { 'a.dbml': 'x' }, entry: 'a.dbml' }, undefined)).toBe('x');
    expect(slugify('  02-ecommerce.dbml ')).toBe('02-ecommercedbml');
  });

  it('are the same in the server HTML and the browser render', async () => {
    const app = (
      <>
        <DbmlDiagram value={SOURCE} />
        <DbmlDiagram value={SOURCE} view="billing" />
        <DbmlDiagram value={SOURCE} title="Shop schema" />
      </>
    );
    const html = await serverHtml(app);
    const fromServer = [...html.matchAll(/class="relvista-diagram[^"]*"[^>]*/g)].map(
      (m) => /data-rv-anchor="([^"]+)"/.exec(m[0])![1],
    );
    expect(fromServer).toHaveLength(3);
    for (const m of html.matchAll(/<div id="([^"]+)" class="relvista-diagram/g))
      expect(fromServer).toContain(m[1]);

    const { container } = render(app);
    const fromClient = Array.from(container.querySelectorAll('.relvista-diagram')).map(
      (el) => el.id,
    );
    expect(fromClient).toEqual(fromServer);
    expect(fromClient[2]).toBe('diagram-shop-schema');
    expect(new Set(fromClient).size).toBe(3);
    for (const el of Array.from(container.querySelectorAll('.relvista-diagram')))
      expect(el.getAttribute('data-rv-anchor')).toBe(el.id);
    // Registered for Docusaurus' broken-anchor check, so `[x](#diagram-shop-schema)` links pass.
    expect(collected.anchors).toEqual(expect.arrayContaining(fromClient));
  });

  it('a heading and a diagram with the same text get different ids', async () => {
    // Docusaurus gives `## Billing` the id "billing".
    const { container } = render(
      <>
        <h2 id="billing">Billing</h2>
        <DbmlDiagram value={SOURCE} title="Billing" />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('[id]')).map((el) => el.id);
    expect(ids).toEqual(['billing', 'diagram-billing']);
  });

  it('warns at build time about two diagrams with one anchor on a page, and in the browser', async () => {
    resetServerAnchors();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await serverHtml(
        <>
          <DbmlDiagram value={SOURCE} title="Shop" />
          <DbmlDiagram value={SOURCE} title="Other" />
        </>,
      );
      expect(warn).not.toHaveBeenCalled();
      resetServerAnchors();
      await serverHtml(
        <>
          <DbmlDiagram value={SOURCE} title="Shop" />
          <DbmlDiagram value={`${SOURCE}\n`} title="Shop" />
        </>,
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toMatch(
        /two diagrams on \/test-page have the anchor "#diagram-shop"/,
      );
      warn.mockClear();
      render(
        <>
          <h2 id="orders">Orders</h2>
          <DbmlDiagram value={SOURCE} id="orders" />
        </>,
      );
      await settle();
      expect(
        warn.mock.calls.some(([m]) => /more than one element .* id "orders"/.test(String(m))),
      ).toBe(true);
    } finally {
      warn.mockRestore();
      resetServerAnchors();
    }
  });

  it('id: the prop and the fence meta', async () => {
    const { container } = render(<DbmlDiagram value={SOURCE} id="billing" title="Billing" />);
    expect(container.querySelector('.relvista-diagram')!.id).toBe('billing');
    expect(parseDbmlMeta('title="Shop" id="billing"').id).toBe('billing');
    expect(parseDbmlMeta('id=shop-db').id).toBe('shop-db');
    expect(parseDbmlMeta('id=""').id).toBeUndefined();
    cleanup();
    const fence = render(
      <MDXCode className="language-dbml" metastring='id="orders-db" title="Orders"'>
        {`${SOURCE}\n`}
      </MDXCode>,
    );
    // `@theme/DbmlDiagram` is a stand-in here: it shows the props it got.
    expect((await fence.findByTestId('diagram')).dataset['id']).toBe('orders-db');
  });
});

describe('the location hash', () => {
  it('anchorOfHash follows parseAnchoredTarget', async () => {
    const { parseAnchoredTarget } = await import('@relvista/renderer');
    for (const hash of [
      '#billing',
      '#billing&table=users',
      '#caf%C3%A9&view=v',
      '#a+b&q=x',
      '#table=users',
      '#',
      '',
      '#%E0%A4%A',
      'billing&vp=1,2,1',
    ]) {
      expect(anchorOfHash(hash), hash).toBe(parseAnchoredTarget(hash)?.anchor ?? null);
    }
  });

  it('names a diagram: it scrolls into view and the viewer gets the target', async () => {
    history.replaceState(null, '', '/docs/page#billing&table=users&view=sales&hops=2');
    const { container } = render(
      <>
        <DbmlDiagram value={SOURCE} id="other" />
        <DbmlDiagram value={SOURCE} id="billing" />
      </>,
    );
    await settle();
    const billing = container.querySelector('#billing')!;
    expect(scrolled).toEqual([billing]);
    expect(viewers.get('billing')!.target).toEqual({ view: 'sales', table: 'users', hops: 2 });
    expect(viewers.get('other')!.target ?? null).toBeNull();
  });

  it('on hashchange, the diagram the new hash names gets its target', async () => {
    render(
      <>
        <DbmlDiagram value={SOURCE} id="a" />
        <DbmlDiagram value={SOURCE} id="b" />
      </>,
    );
    await settle();
    expect(scrolled).toEqual([]);
    await act(async () => {
      history.replaceState(null, '', '/docs/page#b&table=orders');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await settle();
    expect(viewers.get('b')!.target).toEqual({ table: 'orders' });
    expect(viewers.get('a')!.target ?? null).toBeNull();
    expect(scrolled.map((e) => e.id)).toEqual(['b']);
  });

  it('heading anchors and other hashes are left alone', async () => {
    history.replaceState(null, '', '/docs/page#some-heading');
    render(<DbmlDiagram value={SOURCE} id="billing" />);
    await settle();
    expect(scrolled).toEqual([]);
    expect(viewers.get('billing')!.target ?? null).toBeNull();
    viewers.get('billing')!.onTargetChange!({ table: 'users' });
    expect(location.hash).toBe('#some-heading');
  });
});

describe('writing the state back', () => {
  it('only the diagram the hash names updates it, with replaceState', async () => {
    history.replaceState(null, '', '/docs/page#billing&table=users');
    render(
      <>
        <DbmlDiagram value={SOURCE} id="billing" />
        <DbmlDiagram value={SOURCE} id="other" />
      </>,
    );
    await settle();
    const push = vi.spyOn(history, 'pushState');
    const before = history.length;
    viewers.get('billing')!.onTargetChange!({ table: 'orders', detail: 'keys' });
    expect(location.hash).toBe('#billing&table=orders&detail=keys');
    viewers.get('other')!.onTargetChange!({ table: 'users' });
    expect(location.hash).toBe('#billing&table=orders&detail=keys');
    expect(push).not.toHaveBeenCalled();
    expect(history.length).toBe(before);
    push.mockRestore();
  });

  it('after the link button, the diagram it copied owns the hash', async () => {
    render(
      <>
        <DbmlDiagram value={SOURCE} id="a" />
        <DbmlDiagram value={SOURCE} id="b" />
      </>,
    );
    await settle();
    // Nobody named: state changes do not touch the URL.
    viewers.get('b')!.onTargetChange!({ table: 'users' });
    expect(location.hash).toBe('');
    // The viewer copies `location` + '#b&…' and reports it.
    viewers.get('b')!.onLinkCopy!(`${location.origin}/docs/page#b&table=users`, {
      table: 'users',
    });
    expect(location.hash).toBe('#b&table=users');
    viewers.get('b')!.onTargetChange!({ view: 'v' });
    expect(location.hash).toBe('#b&view=v');
    viewers.get('a')!.onTargetChange!({ table: 'orders' });
    expect(location.hash).toBe('#b&view=v');
    expect(location.pathname).toBe('/docs/page');
  });

  it('every diagram passes its anchor to the viewer (the toolbar link button)', async () => {
    render(<DbmlDiagram value={SOURCE} title="Shop" />);
    await settle();
    expect(viewers.get('diagram-shop')!.anchor).toBe('diagram-shop');
  });
});
