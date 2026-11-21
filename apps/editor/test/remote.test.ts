import { describe, expect, it } from 'vitest';
import {
  RemoteError,
  fetchBytes,
  normalizeRemoteUrl,
  readLayoutParam,
  readUrlParam,
  remoteFileName,
  remoteLayoutUrl,
  sidecarUrl,
} from '../src/files/remote.js';

describe('normalizeRemoteUrl', () => {
  it('rewrites GitHub blob URLs to raw', () => {
    expect(normalizeRemoteUrl('https://github.com/o/r/blob/main/db/schema.dbml')).toBe(
      'https://raw.githubusercontent.com/o/r/main/db/schema.dbml',
    );
    expect(normalizeRemoteUrl('https://github.com/o/r/raw/v1.2/a.dbml')).toBe(
      'https://raw.githubusercontent.com/o/r/v1.2/a.dbml',
    );
  });
  it('keeps other https URLs', () => {
    expect(normalizeRemoteUrl('https://example.com/a.dbml?x=1')).toBe(
      'https://example.com/a.dbml?x=1',
    );
  });
  it('rejects other schemes; allows http://localhost', () => {
    for (const u of [
      'http://example.com/a.dbml',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/plain,x',
      'nope',
    ]) {
      expect(() => normalizeRemoteUrl(u)).toThrow(RemoteError);
    }
    expect(normalizeRemoteUrl('http://localhost:5173/a.dbml')).toBe('http://localhost:5173/a.dbml');
  });
  it('names and params', () => {
    expect(remoteFileName('https://x.org/db/my%20schema.dbml?raw=1')).toBe('my schema.dbml');
    expect(remoteFileName('https://x.org/')).toBe('remote.dbml');
    expect(readUrlParam('?url=https%3A%2F%2Fx.org%2Fa.dbml')).toBe('https://x.org/a.dbml');
    expect(readUrlParam('?other=1')).toBeNull();
  });
});

describe('sidecarUrl', () => {
  it('adds .layout.json to the path and keeps the query', () => {
    expect(sidecarUrl('https://x.dev/db/schema.dbml')).toBe(
      'https://x.dev/db/schema.dbml.layout.json',
    );
    expect(sidecarUrl('https://x.dev/schema.dbml?token=abc&raw=1#frag')).toBe(
      'https://x.dev/schema.dbml.layout.json?token=abc&raw=1',
    );
  });
});

describe('layout of a remote file', () => {
  it('asks for none unless &layout is given', () => {
    expect(readLayoutParam('?url=https%3A%2F%2Fx.dev%2Fa.dbml')).toEqual({ kind: 'none' });
    for (const q of ['?url=x&layout', '?url=x&layout=', '?layout=auto', '?layout=1']) {
      expect(readLayoutParam(q), q).toEqual({ kind: 'auto' });
    }
    expect(readLayoutParam('?layout=https%3A%2F%2Fx.dev%2Fl.json')).toEqual({
      kind: 'url',
      url: 'https://x.dev/l.json',
    });
  });
  it('resolves the URL to fetch', () => {
    const file = 'https://x.dev/db/schema.dbml';
    expect(remoteLayoutUrl(file, { kind: 'none' })).toBeNull();
    expect(remoteLayoutUrl(file, { kind: 'auto' })).toBe(
      'https://x.dev/db/schema.dbml.layout.json',
    );
    expect(remoteLayoutUrl(file, { kind: 'url', url: 'layouts/s.json' })).toBe(
      'https://x.dev/db/layouts/s.json',
    );
    expect(
      remoteLayoutUrl(file, { kind: 'url', url: 'https://github.com/o/r/blob/main/s.json' }),
    ).toBe('https://raw.githubusercontent.com/o/r/main/s.json');
    expect(() => remoteLayoutUrl(file, { kind: 'url', url: 'http://evil.example/l.json' })).toThrow(
      RemoteError,
    );
  });
});

describe('fetchBytes', () => {
  const respond = (body: BodyInit | null, init?: ResponseInit) => async () =>
    new Response(body, init);
  it('returns bytes and sends no credentials', async () => {
    let seen: RequestInit | undefined;
    const out = await fetchBytes('https://x.org/a', {
      fetch: async (_u, i) => {
        seen = i;
        return new Response('abc');
      },
    });
    expect(new TextDecoder().decode(out!)).toBe('abc');
    expect(seen).toMatchObject({ mode: 'cors', credentials: 'omit' });
  });
  it('caps the size while streaming', async () => {
    await expect(
      fetchBytes('https://x.org/a', { fetch: respond('x'.repeat(100)), maxBytes: 10 }),
    ).rejects.toThrow(/larger/);
  });
  it('404: error, or null when optional', async () => {
    await expect(
      fetchBytes('https://x.org/a', { fetch: respond('no', { status: 404 }) }),
    ).rejects.toThrow(/404/);
    expect(
      await fetchBytes('https://x.org/a', {
        fetch: respond('no', { status: 404 }),
        optional: true,
      }),
    ).toBeNull();
  });
  it('network failure explains CORS', async () => {
    await expect(
      fetchBytes('https://x.org/a', {
        fetch: async () => {
          throw new TypeError('Failed to fetch');
        },
      }),
    ).rejects.toThrow(/CORS/);
  });
});
