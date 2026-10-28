// Runs checks in a Web Worker with a strict time budget. On timeout the worker is terminated and replaced,
// and the result is "indeterminate" — never counted as incorrect and never consuming an attempt.
import { check as checkInline } from "./check";
import type { CheckInput, CheckResult, CheckSpec } from "./types";

export interface WorkerLike {
  postMessage(m: unknown): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export const CHECK_TIME_BUDGET_MS = 300;
const READY_TIMEOUT_MS = 8000;

export const TIMEOUT_RESULT: CheckResult = {
  status: "indeterminate",
  reason: "timeout",
  message: "That answer took too long to check. Try writing it more simply. This doesn't use up a try.",
};

export class CheckClient {
  private worker: WorkerLike | null = null;
  private ready: Promise<boolean> | null = null;
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();
  /** number of workers terminated after a timeout (for tests and diagnostics) */
  restarts = 0;

  constructor(private readonly factory: (() => WorkerLike) | null, private readonly budgetMs = CHECK_TIME_BUDGET_MS) {}

  private start(): Promise<boolean> {
    if (this.ready) return this.ready;
    if (!this.factory) return (this.ready = Promise.resolve(false));
    let w: WorkerLike;
    try {
      w = this.factory();
    } catch {
      return (this.ready = Promise.resolve(false));
    }
    this.worker = w;
    this.ready = new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), READY_TIMEOUT_MS);
      w.onmessage = (e) => {
        if ((e.data as { ready?: boolean })?.ready) { clearTimeout(t); resolve(true); }
      };
      w.onerror = () => { clearTimeout(t); resolve(false); };
    });
    return this.ready;
  }

  private reset() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }

  /** Warm the worker up ahead of the first answer. */
  warm() { void this.start(); }

  check(spec: CheckSpec, input: CheckInput): Promise<CheckResult> {
    const run = async (): Promise<CheckResult> => {
      const ok = await this.start();
      if (!ok || !this.worker) return checkInline(spec, input); // no worker support: check inline (bounded parser)
      const w = this.worker;
      const id = ++this.seq;
      return new Promise<CheckResult>((resolve) => {
        const timer = setTimeout(() => {
          this.restarts++;
          this.reset();
          resolve(TIMEOUT_RESULT);
        }, this.budgetMs);
        w.onmessage = (e) => {
          const d = e.data as { id?: number; result?: CheckResult };
          if (d?.id !== id || !d.result) return;
          clearTimeout(timer);
          resolve(d.result);
        };
        w.onerror = () => {
          clearTimeout(timer);
          this.reset();
          resolve({ status: "indeterminate", reason: "worker-error", message: "Something went wrong while checking. Please try again. This doesn't use up a try." });
        };
        w.postMessage({ id, spec, input });
      });
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  dispose() { this.reset(); }
}

let shared: CheckClient | null = null;
/** Browser singleton backed by the bundled worker. */
export function getCheckClient(): CheckClient {
  if (shared) return shared;
  const factory = typeof Worker !== "undefined"
    ? () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike
    : null;
  shared = new CheckClient(factory);
  return shared;
}
