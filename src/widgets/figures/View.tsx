"use client";
import { BoxDiagonal, Circuit, Venn } from "./legacy";
import type { FigureState } from "./model";

export function FigureView({ state, reduced }: { state: FigureState; reduced: boolean }) {
  const c = state.config;
  return (
    <div className="figure" data-testid="figure">
      {c.figure === "circuit" && <Circuit E={c.E} r={c.r} R={c.R} showVoltmeter={c.showVoltmeter} cue={state.cue} reduced={reduced} />}
      {c.figure === "venn" && <Venn A={c.A} B={c.B} U={c.U} op={c.op} cue={state.cue} reduced={reduced} />}
      {c.figure === "box" && <BoxDiagonal p={c.p} q={c.q} r={c.r} cue={state.cue} reduced={reduced} />}
      {c.figure === "concept" && (
        <div className="figure__concept" role="img" aria-label={`${c.subject} concept check for ${c.topic}`}>
          <span>Concept check</span>
          <strong>{c.topic}</strong>
          <p>Choose the statement that captures the central relationship or definition.</p>
        </div>
      )}
    </div>
  );
}
