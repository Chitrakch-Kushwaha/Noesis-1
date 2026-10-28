// Deterministic transport for every widget timeline: play, pause, step, scrub, reset, replay.
// The model state at time t is a pure function of t, so replays and scrubs are exact.

export interface TransportState { t: number; duration: number; keyframes: number[]; playing: boolean; rate: number }
export type TransportAction =
  | { type: "play" } | { type: "pause" } | { type: "toggle" }
  | { type: "tick"; dt: number }
  | { type: "scrub"; t: number }
  | { type: "stepForward" } | { type: "stepBack" }
  | { type: "reset" } | { type: "replay" } | { type: "end" }
  | { type: "timeline"; duration: number; keyframes: number[]; autoplay?: boolean; reduced?: boolean };

const EPS = 1e-6;
export const initialTransport = (duration = 0, keyframes: number[] = [0]): TransportState => ({ t: 0, duration, keyframes, playing: false, rate: 1 });

export function transportReduce(s: TransportState, a: TransportAction): TransportState {
  switch (a.type) {
    case "play":
      if (s.duration <= 0) return s;
      return { ...s, playing: true, t: s.t >= s.duration - EPS ? 0 : s.t };
    case "pause": return { ...s, playing: false };
    case "toggle": return transportReduce(s, { type: s.playing ? "pause" : "play" });
    case "tick": {
      if (!s.playing) return s;
      const t = s.t + a.dt * s.rate;
      return t >= s.duration ? { ...s, t: s.duration, playing: false } : { ...s, t };
    }
    case "scrub": return { ...s, playing: false, t: Math.min(s.duration, Math.max(0, a.t)) };
    case "stepForward": {
      const next = s.keyframes.find((k) => k > s.t + EPS) ?? s.duration;
      return { ...s, playing: false, t: next };
    }
    case "stepBack": {
      const prev = [...s.keyframes].reverse().find((k) => k < s.t - EPS) ?? 0;
      return { ...s, playing: false, t: prev };
    }
    case "reset": return { ...s, playing: false, t: 0 };
    case "replay": return s.duration > 0 ? { ...s, playing: true, t: 0 } : s;
    case "end": return { ...s, playing: false, t: s.duration };
    case "timeline": {
      const base = { ...s, duration: a.duration, keyframes: a.keyframes.length ? a.keyframes : [0, a.duration] };
      if (a.duration <= 0) return { ...base, t: 0, playing: false };
      // reduced motion: jump straight to the final state, never animate
      if (a.autoplay) return a.reduced ? { ...base, t: a.duration, playing: false } : { ...base, t: 0, playing: true };
      return { ...base, t: Math.min(s.t, a.duration), playing: false };
    }
  }
}
