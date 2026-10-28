// Dedicated checking worker: keeps parsing and sampling off the main thread (docs/05 §3).
import { check } from "./check";
import type { CheckInput, CheckSpec } from "./types";

interface Req { id: number; spec: CheckSpec; input: CheckInput }
const ctx = self as unknown as { postMessage(m: unknown): void; onmessage: ((e: MessageEvent<Req>) => void) | null };

ctx.onmessage = (e) => {
  const { id, spec, input } = e.data;
  ctx.postMessage({ id, result: check(spec, input) });
};
ctx.postMessage({ ready: true });
