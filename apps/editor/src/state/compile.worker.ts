/// <reference lib="webworker" />
/**
 * `compileDbml` in a module worker (design phase3 §6.2). `CompileResult` is plain JSON by design,
 * so it crosses the boundary by structured clone as is. The scheduler (compile.ts) numbers every
 * request and drops answers that a newer request superseded.
 */
import { compileDbml, type CompileResult } from '@relvista/core';

export interface CompileRequest {
  seq: number;
  files: Record<string, string>;
  entry: string;
}

export type CompileResponse =
  | { seq: number; ok: true; result: CompileResult; ms: number }
  | { seq: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (ev: MessageEvent<CompileRequest>) => {
  const { seq, files, entry } = ev.data;
  try {
    const t = performance.now();
    const result = compileDbml({ files, entry });
    const ms = performance.now() - t;
    scope.postMessage({ seq, ok: true, result, ms } satisfies CompileResponse);
  } catch (e) {
    // compileDbml never throws; a failure here (out of memory, a clone error) means the worker
    // cannot be trusted: the scheduler goes back to compiling on the main thread.
    scope.postMessage({
      seq,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    } satisfies CompileResponse);
  }
};
