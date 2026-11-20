import { describe, expect, it } from 'vitest';
import { idSegment, parseRefId, refIdOf, tableIdOf } from '../src/index.js';

describe('id encoding', () => {
  it('leaves plain names alone and defaults the schema', () => {
    expect(tableIdOf(null, 'users')).toBe('public.users');
    expect(tableIdOf('', 'users')).toBe('public.users');
    expect(tableIdOf('billing', 'order items')).toBe('billing.order items');
    expect(tableIdOf('x-y', 'a-b')).toBe('x-y.a-b');
  });

  it('quotes segments that would make ids ambiguous', () => {
    expect(tableIdOf('x', 'y.z')).toBe('x."y.z"');
    expect(tableIdOf('x.y', 'z')).toBe('"x.y".z');
    expect(tableIdOf('note:a', 'b')).toBe('"note:a".b');
    expect(tableIdOf('s', 'a"b\\c')).toBe('s."a\\"b\\\\c"');
    expect(tableIdOf('s', '-x')).toBe('s."-x"');
    expect(idSegment('')).toBe('""');
    expect(idSegment('a,b')).toBe('"a,b"');
    expect(idSegment('f(x)')).toBe('"f(x)"');
  });

  it('never maps two different names to one id', () => {
    const names = ['a', 'b', 'a.b', 'b.c', 'a.b.c', '"', '\\', '"a"', ':', 'note:x', '', '-', '<>'];
    const ids = new Map<string, string>();
    for (const s of names)
      for (const n of names) {
        const id = tableIdOf(s || 'public', n);
        const key = `${s || 'public'}\u0000${n}`;
        const prev = ids.get(id);
        if (prev !== undefined) expect(prev).toBe(key);
        ids.set(id, key);
      }
  });

  it('round-trips ref ids through parseRefId', () => {
    const cases = [
      [
        { tableId: 'public.users', columns: ['id'] },
        '<',
        { tableId: 's2.posts', columns: ['user_id'] },
        1,
      ],
      [
        { tableId: 'x."y.z"', columns: ['a', 'b'] },
        '?<>?',
        { tableId: '"x.y".z', columns: ['c,d', ')'] },
        3,
      ],
      [{ tableId: 'public."-x"', columns: [] }, '-', { tableId: 'public."<>"', columns: ['"'] }, 1],
    ] as const;
    for (const [from, op, to, n] of cases) {
      const id = refIdOf(
        { ...from, columns: [...from.columns] },
        op,
        { ...to, columns: [...to.columns] },
        n,
      );
      expect(parseRefId(id)).toEqual({
        from: { ...from, columns: [...from.columns] },
        relation: op,
        to: { ...to, columns: [...to.columns] },
        n,
      });
    }
    expect(
      refIdOf(
        { tableId: 'public.a', columns: ['x'] },
        '>',
        { tableId: 'public.b', columns: ['id'] },
        2,
      ),
    ).toBe('ref:public.a(x)>public.b(id)#2');
  });

  it('rejects anything refIdOf would not produce', () => {
    for (const bad of [
      'ref:posts_user',
      'ref:public.a(x)public.b(id)',
      'ref:public.a(x)>public.b(id)#1',
      'ref:public.a(x)>public.b(id)x',
      'ref:public."a"(x)>public.b(id)',
      'ref:a.b.c(x)>public.b(id)',
      'note:x',
    ])
      expect(parseRefId(bad)).toBeNull();
  });
});
