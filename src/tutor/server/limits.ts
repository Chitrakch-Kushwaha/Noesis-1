// Server-side request limits for the tutor routes: an in-memory token bucket per client address
// (kept for 60 s, never persisted, docs/10), body-size checks, and signed speech tokens so the speech
// route only synthesises text that already passed the tutor's checks.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private readonly perMinute: number, private readonly now: () => number = Date.now) {}

  /** null when allowed; otherwise the seconds to wait. */
  take(key: string): number | null {
    const t = this.now();
    for (const [k, b] of this.buckets) if (t - b.at > 60_000) this.buckets.delete(k);
    const b = this.buckets.get(key) ?? { tokens: this.perMinute, at: t };
    const refilled = Math.min(this.perMinute, b.tokens + ((t - b.at) / 60_000) * this.perMinute);
    if (refilled < 1) { this.buckets.set(key, { tokens: refilled, at: t }); return Math.ceil(((1 - refilled) / this.perMinute) * 60); }
    this.buckets.set(key, { tokens: refilled - 1, at: t });
    return null;
  }
}

/** The client address for rate limiting only (memory, 60 s). */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local").slice(0, 64);
}

/** Reads a request body up to `max` bytes; null when it is larger. */
export async function readLimited(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  const text = await req.text();
  return Buffer.byteLength(text) > max ? null : text;
}

// a per-process secret: tokens are only valid for this server process and for ten minutes
const SECRET = randomBytes(32);
const TOKEN_TTL_MS = 10 * 60_000;
const mac = (s: string) => createHmac("sha256", SECRET).update(s).digest("base64url");

export function signSpeech(text: string, now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${mac(`${ts}\n${text}`)}`;
}
export function verifySpeech(text: string, token: string, now = Date.now()): boolean {
  const [ts, sig] = token.split(".");
  if (!ts || !sig || !/^\d+$/.test(ts) || now - Number(ts) > TOKEN_TTL_MS || Number(ts) > now + 5_000) return false;
  const want = Buffer.from(mac(`${ts}\n${text}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
