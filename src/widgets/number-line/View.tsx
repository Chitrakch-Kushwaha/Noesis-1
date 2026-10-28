"use client";
import { useCallback, useRef, type KeyboardEvent } from "react";
import type { Interval } from "@/src/checking/types";
import { fmtNum, useSvgDrag } from "../shared";
import type { BaseAction } from "../types";
import { contains, testX, type End, type NLAction, type NLState } from "./model";

type Dispatch = (a: NLAction | BaseAction) => void;
const W = 640;

export function NumberLineView({ state, dispatch, t }: { state: NLState; dispatch: Dispatch; t: number }) {
  const cfg = state.config;
  const svgRef = useRef<SVGSVGElement>(null);
  const [lo, hi] = cfg.range;
  const X = (x: number) => 40 + ((Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo)) * (W - 80);
  const inv = (px: number) => lo + ((px - 40) / (W - 80)) * (hi - lo);
  const ticks: number[] = [];
  const tickStep = (hi - lo) / cfg.step > 24 ? cfg.step * Math.ceil((hi - lo) / cfg.step / 24) : cfg.step;
  for (let k = Math.ceil(lo / tickStep) * tickStep; k <= hi + 1e-9; k += tickStep) ticks.push(+k.toFixed(9));
  const x = testX(state, t);
  const ref = state.overlay.target ?? state.pieces;
  const H = state.overlay.target ? 210 : 170;
  const lineY = H - 60;
  return (
    <div className="nl">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Number line" data-testid="number-line">
        <line className="v-axis" x1={24} x2={W - 24} y1={lineY} y2={lineY} />
        {ticks.map((k) => <g key={k}><line className="v-axis" x1={X(k)} x2={X(k)} y1={lineY - 6} y2={lineY + 6} /><text className="v-text" x={X(k)} y={lineY + 24} textAnchor="middle">{fmtNum(k)}</text></g>)}
        {state.overlay.target && <Union u={state.overlay.target} y={44} X={X} lo={lo} hi={hi} tone="good" label="the set" />}
        {state.pieces.map((p, i) => <Piece key={i} p={p} i={i} y={state.overlay.target ? 96 : 60} X={X} inv={inv} lo={lo} hi={hi} state={state} dispatch={dispatch} svgRef={svgRef} />)}
        {x !== null && (
          <g data-testid="nl-test-point">
            <line x1={X(x)} x2={X(x)} y1={20} y2={lineY} stroke="var(--highlight-peach)" strokeDasharray="3 4" />
            <circle cx={X(x)} cy={lineY} r={6} fill={contains(ref, x) ? "var(--success)" : "var(--accent-coral)"} />
            <text className={contains(ref, x) ? "v-label-good" : "v-label-bad"} x={X(x)} y={16} textAnchor="middle">x = {fmtNum(x)} {contains(ref, x) ? "✓ in" : "✗ out"}</text>
          </g>
        )}
      </svg>
      {cfg.editable && <Controls state={state} dispatch={dispatch} />}
    </div>
  );
}

function Union({ u, y, X, lo, hi, tone, label }: { u: Interval[]; y: number; X: (x: number) => number; lo: number; hi: number; tone: "good" | "bad"; label: string }) {
  const col = tone === "good" ? "var(--accent-amber)" : "var(--accent-coral)";
  return <g data-testid="nl-target">
    <text className="v-label-good" x={30} y={y - 12}>{label}</text>
    {u.map((p, i) => <g key={i}>
      <line x1={X(p.lo)} x2={X(p.hi)} y1={y} y2={y} stroke={col} strokeWidth={4} strokeDasharray="7 5" />
      {Number.isFinite(p.lo) ? <circle cx={X(p.lo)} cy={y} r={6} fill={p.loClosed ? col : "var(--background)"} stroke={col} strokeWidth={2.5} /> : <path d={`M ${X(lo) + 2} ${y} l 11 -7 v 14 z`} fill={col} />}
      {Number.isFinite(p.hi) ? <circle cx={X(p.hi)} cy={y} r={6} fill={p.hiClosed ? col : "var(--background)"} stroke={col} strokeWidth={2.5} /> : <path d={`M ${X(hi) - 2} ${y} l -11 -7 v 14 z`} fill={col} />}
    </g>)}
  </g>;
}

function Piece({ p, i, y, X, inv, lo, hi, state, dispatch, svgRef }: {
  p: Interval; i: number; y: number; X: (x: number) => number; inv: (px: number) => number; lo: number; hi: number; state: NLState; dispatch: Dispatch; svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  return <g data-testid={`nl-piece-${i}`}>
    <line x1={X(p.lo)} x2={X(p.hi)} y1={y} y2={y} stroke="var(--accent-orange)" strokeWidth={6} strokeLinecap="butt" />
    {(["lo", "hi"] as End[]).map((end) => <EndHandle key={end} p={p} i={i} end={end} y={y} X={X} inv={inv} lo={lo} hi={hi} state={state} dispatch={dispatch} svgRef={svgRef} />)}
  </g>;
}

function EndHandle({ p, i, end, y, X, inv, lo, hi, state, dispatch, svgRef }: {
  p: Interval; i: number; end: End; y: number; X: (x: number) => number; inv: (px: number) => number; lo: number; hi: number; state: NLState; dispatch: Dispatch; svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const v = end === "lo" ? p.lo : p.hi;
  const closed = end === "lo" ? p.loClosed : p.hiClosed;
  const hl = state.overlay.highlight.some((h) => h.piece === i && h.end === end);
  const onMove = useCallback((pt: { x: number }) => dispatch({ type: "move", index: i, end, value: inv(pt.x) }), [dispatch, i, end, inv]);
  const drag = useSvgDrag(svgRef, onMove);
  const onKey = (e: KeyboardEvent<SVGElement>) => {
    const step = state.config.step;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); if (Number.isFinite(v)) dispatch({ type: "move", index: i, end, value: v + (e.key === "ArrowRight" ? step : -step) }); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (Number.isFinite(v)) dispatch({ type: "toggle", index: i, end }); }
    else if (e.key === "Home" && end === "lo") { e.preventDefault(); dispatch({ type: "set-infinite", index: i, end, infinite: !Number.isFinite(v) ? false : true }); }
    else if (e.key === "End" && end === "hi") { e.preventDefault(); dispatch({ type: "set-infinite", index: i, end, infinite: !Number.isFinite(v) ? false : true }); }
  };
  const cx = Number.isFinite(v) ? X(v) : end === "lo" ? X(lo) : X(hi);
  const label = `${end === "lo" ? "Left" : "Right"} endpoint of piece ${i + 1}: ${Number.isFinite(v) ? `${fmtNum(v)}, ${closed ? "included" : "not included"}` : end === "lo" ? "minus infinity" : "infinity"}. Arrow keys move it, Enter or Space toggles included, ${end === "lo" ? "Home" : "End"} switches to infinity.`;
  return <g>
    {hl && <circle cx={cx} cy={y} r={17} fill="none" stroke="var(--accent-coral)" strokeWidth={3} data-testid="nl-endpoint-highlight" />}
    {Number.isFinite(v)
      ? <circle cx={cx} cy={y} r={8} fill={closed ? "var(--accent-orange)" : "var(--background)"} stroke="var(--accent-orange)" strokeWidth={3} />
      : <path d={end === "lo" ? `M ${cx} ${y} l 14 -9 v 18 z` : `M ${cx} ${y} l -14 -9 v 18 z`} fill="var(--accent-orange)" />}
    {state.config.editable && (
      <circle cx={cx} cy={y} r={20} className="vb-handle" tabIndex={0} role="slider" aria-label={label}
        aria-valuemin={lo} aria-valuemax={hi} aria-valuenow={Number.isFinite(v) ? v : end === "lo" ? lo : hi} aria-valuetext={Number.isFinite(v) ? `${fmtNum(v)}${closed ? ", included" : ", not included"}` : "infinity"}
        onKeyDown={onKey} onDoubleClick={() => Number.isFinite(v) && dispatch({ type: "toggle", index: i, end })} data-testid={`nl-handle-${i}-${end}`} {...drag} />
    )}
  </g>;
}

function Controls({ state, dispatch }: { state: NLState; dispatch: Dispatch }) {
  const cfg = state.config;
  return (
    <details className="precise" open>
      <summary>Precise controls <span className="muted">(keyboard and form alternative to dragging)</span></summary>
      <p className="muted precise__help">Drag endpoints, or focus one and use the arrow keys; Enter toggles whether it is included. You can also type the answer in the box.</p>
      {state.pieces.map((p, i) => (
        <fieldset key={i} className="precise__row" data-testid={`nl-row-${i}`}>
          <legend>Piece {i + 1}</legend>
          {(["lo", "hi"] as End[]).map((end) => {
            const v = end === "lo" ? p.lo : p.hi, closed = end === "lo" ? p.loClosed : p.hiClosed;
            return <span key={end} className="nl-end">
              <label>{end === "lo" ? "From" : "To"} <input type="number" step={cfg.step} value={Number.isFinite(v) ? v : ""} placeholder={end === "lo" ? "−∞" : "∞"} disabled={!Number.isFinite(v)}
                onChange={(e) => e.target.value !== "" && dispatch({ type: "move", index: i, end, value: Number(e.target.value) })} data-testid={`nl-input-${i}-${end}`} /></label>
              <label><input type="checkbox" checked={closed} disabled={!Number.isFinite(v)} onChange={() => dispatch({ type: "toggle", index: i, end })} data-testid={`nl-closed-${i}-${end}`} /> included</label>
              <label><input type="checkbox" checked={!Number.isFinite(v)} onChange={() => dispatch({ type: "set-infinite", index: i, end, infinite: Number.isFinite(v) })} data-testid={`nl-inf-${i}-${end}`} /> {end === "lo" ? "−∞" : "∞"}</label>
            </span>;
          })}
          <button type="button" className="btn btn--quiet" onClick={() => dispatch({ type: "remove-piece", index: i })}>Remove</button>
        </fieldset>
      ))}
      {state.pieces.length < cfg.maxPieces && <button type="button" className="btn" onClick={() => dispatch({ type: "add-piece" })} data-testid="nl-add">Add an interval</button>}
    </details>
  );
}
