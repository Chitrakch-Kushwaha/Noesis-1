"use client";
// The live visual: the widget view, its transport (play, pause, step, scrub, replay, reset) and a
// text description kept in sync for screen readers. Every widget uses the same controls.
import type { ReactNode } from "react";
import { FigureView } from "@/src/widgets/figures/View";
import { GraphPlotView } from "@/src/widgets/graph-plot/View";
import { MotionTrackView } from "@/src/widgets/motion-track/View";
import { NumberLineView } from "@/src/widgets/number-line/View";
import { TriangleExplorerView } from "@/src/widgets/triangle-explorer/View";
import { RigidBodyView } from "@/src/widgets/rigid-body/View";
import { OscillatorView } from "@/src/widgets/oscillator/View";
import { VectorBoardView } from "@/src/widgets/vector-board/View";
import { CircuitBoardView } from "@/src/widgets/circuit-board/View";
import { FieldMapView } from "@/src/widgets/field-map/View";
import { RayDiagramView } from "@/src/widgets/ray-diagram/View";
import type { WidgetHost } from "./useWidgetHost";

const fmtT = (t: number) => `${t.toFixed(t >= 10 ? 1 : 2)} s`;

function View({ type, host, reduced }: { type: string; host: WidgetHost; reduced: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = { state: host.state as any, dispatch: host.dispatch, t: host.transport.t };
  switch (type) {
    case "vector-board": return <VectorBoardView {...p} />;
    case "motion-track": return <MotionTrackView {...p} />;
    case "graph-plot": return <GraphPlotView {...p} />;
    case "number-line": return <NumberLineView {...p} />;
    case "triangle-explorer": return <TriangleExplorerView {...p} />;
    case "rigid-body": return <RigidBodyView {...p} />;
    case "oscillator": return <OscillatorView {...p} />;
    case "circuit-board": return <CircuitBoardView {...p} />;
    case "field-map": return <FieldMapView {...p} />;
    case "ray-diagram": return <RayDiagramView {...p} />;
    case "figure": return <FigureView state={p.state} reduced={reduced} />;
    default: return null;
  }
}

export function WidgetStage({ type, host, reduced, instructions, altText, resetLabel, banner, onReset }: {
  type: string; host: WidgetHost; reduced: boolean; instructions: string; altText: string; resetLabel: string;
  banner?: ReactNode; onReset(): void;
}) {
  const tr = host.transport;
  const hasTimeline = tr.duration > 0;
  return (
    <section className="qstage" aria-labelledby="stage-title" data-testid="stage">
      <h2 id="stage-title" className="sr-only">Interactive visual</h2>
      <p className="sr-only">{altText}</p>
      {banner}
      <div className="stage-view"><View type={type} host={host} reduced={reduced} /></div>
      <div className="transport" role="group" aria-label="Animation controls" data-testid="transport">
        <button type="button" className="btn btn--small" onClick={() => host.send({ type: "toggle" })} disabled={!hasTimeline} aria-pressed={tr.playing} data-testid="tr-play">
          {tr.playing ? "Pause" : "Play"}
        </button>
        <button type="button" className="btn btn--small btn--icon" onClick={() => host.send({ type: "stepBack" })} disabled={!hasTimeline} aria-label="Step back" data-testid="tr-back">⏮︎</button>
        <button type="button" className="btn btn--small btn--icon" onClick={() => host.send({ type: "stepForward" })} disabled={!hasTimeline} aria-label="Step forward" data-testid="tr-forward">⏭︎</button>
        <button type="button" className="btn btn--small" onClick={() => host.send({ type: "replay" })} disabled={!hasTimeline} data-testid="tr-replay">Replay</button>
        <label className="sr-only" htmlFor="tr-scrub">Time</label>
        <input
          id="tr-scrub" type="range" min={0} max={hasTimeline ? tr.duration : 1} step={hasTimeline ? tr.duration / 200 : 1} value={tr.t}
          disabled={!hasTimeline} onChange={(e) => host.send({ type: "scrub", t: Number(e.target.value) })}
          aria-valuetext={hasTimeline ? `${fmtT(tr.t)} of ${fmtT(tr.duration)}` : "No animation"} data-testid="tr-scrub"
        />
        <span className="transport__time" aria-hidden="true" data-testid="tr-time">{hasTimeline ? `${fmtT(tr.t)} / ${fmtT(tr.duration)}` : "—"}</span>
        <button type="button" className="btn btn--small btn--quiet" onClick={onReset} data-testid="tr-reset">{resetLabel}</button>
      </div>
      <p className="vis-caption" data-testid="stage-description">{host.description}</p>
      <p className="sr-only" aria-live="polite" data-testid="stage-announce">{host.announced}</p>
      <details className="stage-help">
        <summary>How to use this visual</summary>
        <p>{instructions}</p>
        <p>Play, Pause, Step and the time slider work with the keyboard. With reduced motion on, animations jump straight to their end state and are described in text.</p>
      </details>
    </section>
  );
}
