"use client";
// Hosts one live widget: its model state, the shared transport clock, and cue application.
// Hints, misconception feedback, consequences and worked-solution steps all drive this same state.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cues } from "@/src/content/instantiate";
import { useTransport } from "@/src/widgets/useTransport";
import type { AnyModel } from "@/src/widgets/registry";

const playTokenOf = (s: unknown) => (s as { playToken?: number }).playToken ?? 0;

/** Apply cues to a state with the model's pure reducer. */
export function foldCues(model: AnyModel, state: unknown, cues: Cues): unknown {
  return cues.reduce((s, c) => {
    if (c.cue === "clear-overlay") return model.reduce(s, { type: "clear-overlay" });
    if (c.cue === "reset") return model.reduce(s, { type: "reset" });
    return model.reduce(s, { type: "cue", cue: c.cue, args: c.args });
  }, state);
}

/** `restored` is a saved state of the same widget (the student's own work), used once on mount. */
export function useWidgetHost(model: AnyModel, config: Record<string, unknown>, reduced: boolean, restored?: unknown) {
  const initial = useMemo(() => model.init(model.configSchema.parse(config)), [model, config]);
  const [state, setState] = useState<unknown>(() => restored ?? initial);
  const [transport, send] = useTransport(reduced);
  const lastToken = useRef(playTokenOf(initial));
  const lastTimeline = useRef("");

  // keep the transport's timeline in step with the model. A bumped play token starts playback; `show`
  // can also ask for playback explicitly (a consequence or solution step built from a fresh state).
  const pendingAutoplay = useRef<boolean | null>(null);
  useEffect(() => {
    const tl = model.timeline(state);
    const key = `${tl.duration}|${tl.keyframes.join(",")}`;
    const token = playTokenOf(state);
    const auto = pendingAutoplay.current ?? token !== lastToken.current;
    pendingAutoplay.current = null;
    lastToken.current = token;
    if (auto) send({ type: "timeline", ...tl, autoplay: true, reduced });
    else if (key !== lastTimeline.current) send({ type: "timeline", ...tl });
    lastTimeline.current = key;
  }, [model, state, reduced, send]);

  const dispatch = useCallback((a: { type: string; [k: string]: unknown }) => setState((s: unknown) => model.reduce(s, a as never)), [model]);
  const applyCues = useCallback((cues: Cues) => { if (cues.length) setState((s: unknown) => foldCues(model, s, cues)); }, [model]);
  /** Show a computed state (a consequence, a solution step, or the student's own answer again). */
  const show = useCallback((next: unknown, opts: { autoplay?: boolean } = {}) => {
    pendingAutoplay.current = !!opts.autoplay;
    setState(next);
  }, []);
  const reset = useCallback(() => { setState(model.init(model.configSchema.parse(config))); send({ type: "reset" }); }, [model, config, send]);
  const fresh = useCallback(() => model.init(model.configSchema.parse(config)), [model, config]);

  // the text description follows the clock, but only updates the live region when the clock is still
  const description = useMemo(() => model.describe(state, transport.t), [model, state, transport.t]);
  // at most one announcement every 500 ms while the student drags, with the final state always announced
  const [announced, setAnnounced] = useState(description);
  const lastAnnounce = useRef(0);
  useEffect(() => {
    if (transport.playing) return;
    const wait = Math.max(0, 500 - (Date.now() - lastAnnounce.current));
    const id = setTimeout(() => { lastAnnounce.current = Date.now(); setAnnounced(description); }, wait);
    return () => clearTimeout(id);
  }, [transport.playing, description]);

  return { state, dispatch, applyCues, show, reset, fresh, transport, send, description, announced };
}
export type WidgetHost = ReturnType<typeof useWidgetHost>;
