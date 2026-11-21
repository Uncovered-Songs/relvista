/**
 * Debounced `compileDbml` (main thread, design §4.2): 150 ms after typing, immediately after open.
 * Keeps the last good model; the caller handles rename detection on each new good model.
 */
import { compileDbml, type CompileResult } from '@relvista/core';

export const COMPILE_DEBOUNCE_MS = 150;

export interface CompileOutcome {
  result: CompileResult;
  /** Compile time in ms (performance budget: ≤ 40 ms for 14-large). */
  ms: number;
}

export class CompileScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: (() => { files: Record<string, string>; entry: string }) | null = null;

  constructor(private readonly onResult: (o: CompileOutcome) => void) {}

  /** Schedules a compile; `input` is read when the timer fires (latest texts win). */
  schedule(
    input: () => { files: Record<string, string>; entry: string },
    delay = COMPILE_DEBOUNCE_MS,
  ): void {
    this.pending = input;
    if (this.timer !== null) clearTimeout(this.timer);
    if (delay <= 0) {
      this.flush();
      return;
    }
    this.timer = setTimeout(() => this.flush(), delay);
  }

  flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const input = this.pending;
    this.pending = null;
    if (!input) return;
    const t = performance.now();
    const result = compileDbml(input());
    this.onResult({ result, ms: performance.now() - t });
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}
