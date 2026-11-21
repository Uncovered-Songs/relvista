import { describe, expect, it } from 'vitest';
import {
  RemoteError,
  fetchBytes,
  normalizeRemoteUrl,
  readUrlParam,
  remoteFileName,
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
