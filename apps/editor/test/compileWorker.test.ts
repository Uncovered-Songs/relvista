/**
 * CompileScheduler (design phase3 §6.2) with a fake worker and a fake clock: the sync / worker
 * decision, dropping superseded results, coalescing while a worker compile is in flight, and the
 * fallback to sync when the worker fails.
 */
import { compileDbml, type CompileResult } from '@relvista/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CompileScheduler,
  WORKER_MAX_CHARS,
  WORKER_THRESHOLD_MS,
  type CompileInputFiles,
  type CompileOutcome,
  type CompileWorkerLike,
} from '../src/state/compile.js';
import type { CompileRequest, CompileResponse } from '../src/state/compile.worker.js';

class FakeWorker implements CompileWorkerLike {
  onmessage: ((ev: MessageEvent<CompileResponse>) => void) | null = null;
  onerror: ((ev: ErrorEvent | Event) => void) | null = null;
  onmessageerror: ((ev: MessageEvent) => void) | null = null;
  readonly posted: CompileRequest[] = [];
  terminated = false;
  postMessage(m: CompileRequest): void {
    this.posted.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Answers the request `seq` as the real worker would. */
  answer(seq: number, ms = 40): void {
    const req = this.posted.find((p) => p.seq === seq)!;
    const result = compileDbml({ files: req.files, entry: req.entry });
    this.onmessage?.({ data: { seq, ok: true, result, ms } } as MessageEvent<CompileResponse>);
  }
  crash(): void {
    this.onerror?.({ message: 'boom', preventDefault() {} } as unknown as ErrorEvent);
  }
}

const doc = (text: string): CompileInputFiles => ({ files: { 's.dbml': text }, entry: 's.dbml' });
const table = (name: string) => `Table ${name} {\n  id int [pk]\n}\n`;

interface Harness {
  scheduler: CompileScheduler;
  results: CompileOutcome[];
  workers: FakeWorker[];
  warn: ReturnType<typeof vi.fn>;
  /** Next sync compile takes this long (fake clock). */
  setSyncMs(ms: number): void;
}

function harness(options: { workers?: boolean; throwOnCreate?: boolean } = {}): Harness {
  let clock = 0;
  let syncMs = 5;
  const results: CompileOutcome[] = [];
  const workers: FakeWorker[] = [];
  const warn = vi.fn();
  const scheduler = new CompileScheduler((o) => results.push(o), {
    now: () => clock,
    compile: (input) => {
      clock += syncMs;
      return compileDbml(input);
    },
    createWorker: () => {
      if (options.throwOnCreate) throw new Error('no workers here');
      if (options.workers === false) return null;
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    warn,
  });
  return { scheduler, results, workers, warn, setSyncMs: (ms) => (syncMs = ms) };
}

const tablesOf = (r: CompileResult) => r.model?.tables.map((t) => t.name) ?? [];

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('CompileScheduler', () => {
  it('compiles on the main thread while compiles are fast and texts small', () => {
    const h = harness();
    h.scheduler.schedule(() => doc(table('a')), 0);
    h.scheduler.schedule(() => doc(table('b')), 0);
    expect(h.results.map((r) => r.mode)).toEqual(['sync', 'sync']);
    expect(tablesOf(h.results[1]!.result)).toEqual(['b']);
    expect(h.workers).toHaveLength(0);
  });

  it('debounces: the latest input wins when the timer fires', () => {
    const h = harness();
    let text = table('a');
    h.scheduler.schedule(() => doc(text));
    text = table('b');
    h.scheduler.schedule(() => doc(text));
    expect(h.results).toHaveLength(0);
    vi.advanceTimersByTime(150);
    expect(h.results).toHaveLength(1);
    expect(tablesOf(h.results[0]!.result)).toEqual(['b']);
  });

  it(`moves to the worker after a compile slower than ${WORKER_THRESHOLD_MS} ms, and back`, () => {
    const h = harness();
    h.setSyncMs(WORKER_THRESHOLD_MS + 5);
    h.scheduler.schedule(() => doc(table('a')), 0);
    expect(h.results[0]!.mode).toBe('sync');
    // The slow sync compile started the worker ahead of need.
    expect(h.workers).toHaveLength(1);
    expect(h.scheduler.nextMode(doc(table('b')))).toBe('worker');

    h.scheduler.schedule(() => doc(table('b')), 0);
    expect(h.results).toHaveLength(1);
    const w = h.workers[0]!;
    expect(w.posted).toHaveLength(1);
    w.answer(w.posted[0]!.seq, 10);
    expect(h.results[1]!.mode).toBe('worker');
    expect(tablesOf(h.results[1]!.result)).toEqual(['b']);
    expect(h.results[1]!.ms).toBe(10);
    // The worker's compile was fast: the next one is sync again.
    h.setSyncMs(3);
    h.scheduler.schedule(() => doc(table('c')), 0);
    expect(h.results[2]!.mode).toBe('sync');
  });

  it('exactly at the threshold stays sync', () => {
    const h = harness();
    h.setSyncMs(WORKER_THRESHOLD_MS);
    h.scheduler.schedule(() => doc(table('a')), 0);
    expect(h.scheduler.nextMode(doc(table('a')))).toBe('sync');
  });

  it(`sends texts over ${WORKER_MAX_CHARS} characters to the worker even when fast`, () => {
    const h = harness();
    const big = `${table('big')}// ${'x'.repeat(WORKER_MAX_CHARS)}\n`;
    expect(h.scheduler.nextMode(doc(big))).toBe('worker');
    expect(h.scheduler.nextMode(doc(table('small')))).toBe('sync');
    h.scheduler.schedule(() => doc(big), 0);
    expect(h.workers[0]!.posted).toHaveLength(1);
    // Two files that together pass the limit count too.
    const half = `// ${'x'.repeat(WORKER_MAX_CHARS / 2 + 10)}\n`;
    expect(
      h.scheduler.nextMode({ files: { 'a.dbml': half, 'b.dbml': half }, entry: 'a.dbml' }),
    ).toBe('worker');
  });

  it('keeps one compile in flight and sends only the latest input when it returns', () => {
    const h = harness();
    h.setSyncMs(40);
    h.scheduler.schedule(() => doc(table('a')), 0); // slow sync: next ones go to the worker
    h.scheduler.schedule(() => doc(table('b')), 0);
    h.scheduler.schedule(() => doc(table('c')), 0);
    h.scheduler.schedule(() => doc(table('d')), 0);
    const w = h.workers[0]!;
    expect(w.posted.map((p) => tablesOf(compileDbml(p)))).toEqual([['b']]);
    // 'b' is superseded by 'd': dropped, and 'd' goes out.
    w.answer(w.posted[0]!.seq);
    expect(h.results).toHaveLength(1);
    expect(w.posted).toHaveLength(2);
    expect(tablesOf(compileDbml(w.posted[1]!))).toEqual(['d']);
    w.answer(w.posted[1]!.seq);
    expect(h.results).toHaveLength(2);
    expect(tablesOf(h.results[1]!.result)).toEqual(['d']);
  });

  it('drops a worker result superseded by a sync run, and after cancel()', () => {
    const h = harness();
    h.setSyncMs(40);
    h.scheduler.schedule(() => doc(table('a')), 0);
    h.scheduler.schedule(() => doc(table('b')), 0); // worker
    const w = h.workers[0]!;
    // The worker reports a fast compile for an older request? Simulate the sync path taking over:
    // a fresh scheduler state where the next run is sync (fast) while 'b' is in flight.
    h.setSyncMs(1);
    (h.scheduler as unknown as { lastMs: number }).lastMs = 1;
    h.scheduler.schedule(() => doc(table('c')), 0);
    expect(h.results.map((r) => tablesOf(r.result))).toEqual([['a'], ['c']]);
    w.answer(w.posted[0]!.seq);
    expect(h.results).toHaveLength(2); // 'b' dropped

    (h.scheduler as unknown as { lastMs: number }).lastMs = 40;
    h.scheduler.schedule(() => doc(table('e')), 0);
    h.scheduler.cancel();
    w.answer(w.posted[1]!.seq);
    expect(h.results).toHaveLength(2); // cancelled
    // Results with an unknown sequence number are ignored.
    w.onmessage?.({
      data: { seq: 999, ok: true, result: compileDbml(''), ms: 1 },
    } as MessageEvent<CompileResponse>);
    expect(h.results).toHaveLength(2);
  });

  it('falls back to sync when the worker fails, logging once', () => {
    const h = harness();
    h.setSyncMs(40);
    h.scheduler.schedule(() => doc(table('a')), 0);
    h.scheduler.schedule(() => doc(table('b')), 0); // in flight in the worker
    const w = h.workers[0]!;
    w.crash();
    expect(w.terminated).toBe(true);
    // The in-flight input is compiled on the main thread instead.
    expect(h.results.map((r) => [r.mode, ...tablesOf(r.result)])).toEqual([
      ['sync', 'a'],
      ['sync', 'b'],
    ]);
    h.scheduler.schedule(() => doc(table('c')), 0);
    h.scheduler.schedule(() => doc(table('d')), 0);
    expect(h.results.map((r) => r.mode)).toEqual(['sync', 'sync', 'sync', 'sync']);
    expect(h.workers).toHaveLength(1);
    w.crash();
    expect(h.warn).toHaveBeenCalledTimes(1);
  });

  it('a worker that reports an error counts as a failure', () => {
    const h = harness();
    h.setSyncMs(40);
    h.scheduler.schedule(() => doc(table('a')), 0);
    h.scheduler.schedule(() => doc(table('b')), 0);
    const w = h.workers[0]!;
    w.onmessage?.({
      data: { seq: w.posted[0]!.seq, ok: false, error: 'out of memory' },
    } as MessageEvent<CompileResponse>);
    expect(h.results.map((r) => [r.mode, ...tablesOf(r.result)])).toEqual([
      ['sync', 'a'],
      ['sync', 'b'],
    ]);
    expect(h.warn).toHaveBeenCalledTimes(1);
  });

  it('stays sync without workers, and when creating one throws (logged once)', () => {
    const none = harness({ workers: false });
    none.setSyncMs(100);
    for (const n of ['a', 'b', 'c']) none.scheduler.schedule(() => doc(table(n)), 0);
    expect(none.results.map((r) => r.mode)).toEqual(['sync', 'sync', 'sync']);
    expect(none.warn).not.toHaveBeenCalled();

    const throwing = harness({ throwOnCreate: true });
    throwing.setSyncMs(100);
    for (const n of ['a', 'b', 'c']) throwing.scheduler.schedule(() => doc(table(n)), 0);
    expect(throwing.results.map((r) => r.mode)).toEqual(['sync', 'sync', 'sync']);
    expect(throwing.warn).toHaveBeenCalledTimes(1);
  });

  it('reports latency from the scheduled run to the result', () => {
    const h = harness();
    h.setSyncMs(7);
    h.scheduler.schedule(() => doc(table('a')), 0);
    expect(h.results[0]!.ms).toBe(7);
    expect(h.results[0]!.latencyMs).toBe(7);
  });

  it('without a worker, compiles in Node with the real defaults', () => {
    const results: CompileOutcome[] = [];
    const s = new CompileScheduler((o) => results.push(o));
    s.schedule(() => doc(table('real')), 0);
    expect(results[0]!.mode).toBe('sync');
    expect(tablesOf(results[0]!.result)).toEqual(['real']);
    s.dispose();
  });
});
