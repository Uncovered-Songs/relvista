// Browser-safe: the identity of a static (build-time) diagram, the same on the server and the client.

/** 32-bit FNV-1a of `text`, seeded (two seeds give a 64-bit identity). */
function fnv1a(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const hex8 = (n: number): string => n.toString(16).padStart(8, '0');

/** 16 hex digits identifying `text` (FNV-1a with two seeds). */
export function hashText(text: string): string {
  return hex8(fnv1a(text, 0x811c9dc5)) + hex8(fnv1a(text, 0x050c5d1f));
}

/**
 * Key of a static diagram: a hash of everything its markup depends on, computed from the props
 * (so the client finds the server's markup before it has fetched anything). Paths stand for the
 * files they name; objects are serialised.
 */
export function staticKey(parts: readonly unknown[]): string {
  return hashText(JSON.stringify(parts));
}
