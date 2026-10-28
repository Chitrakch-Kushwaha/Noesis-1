"use client";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { initialTransport, transportReduce, type TransportAction, type TransportState } from "./transport";

/** Runs the transport clock with requestAnimationFrame while playing; pauses in background tabs. */
export function useTransport(reduced: boolean) {
  const [state, dispatch] = useReducer(transportReduce, undefined, () => initialTransport());
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!state.playing) { last.current = null; return; }
    if (reduced) { dispatch({ type: "end" }); return; }
    let id = 0;
    const loop = (now: number) => {
      const dt = last.current === null ? 0 : Math.min(0.1, (now - last.current) / 1000);
      last.current = now;
      dispatch({ type: "tick", dt });
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    const onHide = () => { if (document.hidden) dispatch({ type: "pause" }); };
    document.addEventListener("visibilitychange", onHide);
    return () => { cancelAnimationFrame(id); document.removeEventListener("visibilitychange", onHide); last.current = null; };
  }, [state.playing, reduced]);
  const send = useCallback((a: TransportAction) => dispatch(a), []);
  return [state, send] as [TransportState, (a: TransportAction) => void];
}
