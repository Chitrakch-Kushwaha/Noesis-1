"use client";
import { useCallback, useId, useRef } from "react";
import { arrowHead, fmtNum, useSvgDrag } from "../shared";
import type { BaseAction } from "../types";
import { angleAt, geometry, roleOf, type Side, type TEAction, type TEState } from "./model";

const W = 640, H = 360;
type Dispatch = (a: TEAction | BaseAction) => void;
const TONE: Record<Side, string> = { opposite: "var(--accent-coral)", adjacent: "var(--accent-amber)", hypotenuse: "var(--highlight-peach)" };
const NAME: Record<Side, string> = { opposite: "opposite", adjacent: "adjacent", hypotenuse: "hypotenuse" };

export function TriangleExplorerView({ state, dispatch, t }: { state: TEState; dispatch: Dispatch; t: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const cfg = state.config;
  const vector = cfg.mode === "vector";
  const g = geometry(state, t);
  const k = 250 / cfg.hypotenuse;
  const A = { x: vector ? 180 : 140, y: 310 };
  const C = { x: A.x + g.ac * k, y: A.y };
  const B = { x: C.x, y: A.y - g.bc * k };
  const hl = new Set(state.overlay.highlight);
  const id = useId();

  const onMove = useCallback((p: { x: number; y: number }) => {
    const deg = (Math.atan2(A.y - p.y, Math.max(1, p.x - A.x)) * 180) / Math.PI;
    dispatch({ type: "set-angle", deg });
  }, [dispatch, A.x, A.y]);
  const drag = useSvgDrag(svgRef, onMove);

  const seg = (name: "AC" | "BC" | "AB", p: { x: number; y: number }, q: { x: number; y: number }, off: { x: number; y: number }) => {
    const role = roleOf(state.marked, name);
    const len = name === "AB" ? g.hyp : name === "AC" ? g.ac : g.bc;
    const mid = { x: (p.x + q.x) / 2 + off.x, y: (p.y + q.y) / 2 + off.y };
    const strong = hl.has(role);
    const isVec = vector && name === "AB";
    return (
      <g data-testid={`te-side-${name}`} data-role={role}>
        <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={cfg.showRoles ? TONE[role] : "var(--text-muted)"} strokeWidth={strong ? 7 : isVec ? 4 : 3} strokeDasharray={vector && name !== "AB" && !state.overlay.shadows ? "6 6" : undefined} />
        {isVec && <polygon points={arrowHead(p.x, p.y, q.x, q.y, 13)} fill={TONE.hypotenuse} />}
        {cfg.showRoles && <text className="v-text" x={mid.x} y={mid.y} textAnchor="middle" fill={TONE[role]} fontWeight={strong ? 700 : 500}>{NAME[role]}{state.showValues ? ` ${fmtNum(len)}${cfg.unit ? ` ${cfg.unit}` : ""}` : ""}</text>}
      </g>
    );
  };

  // angle arc at the marked corner
  const at = state.marked === "A" ? A : B;
  const r = 34;
  const ra = (g.angleA * Math.PI) / 180;
  const arc = state.marked === "A"
    ? `M ${A.x + r} ${A.y} A ${r} ${r} 0 0 0 ${A.x + r * Math.cos(ra)} ${A.y - r * Math.sin(ra)}`
    : `M ${B.x} ${B.y + r} A ${r} ${r} 0 0 1 ${B.x - r * Math.cos(ra)} ${B.y + r * Math.sin(ra)}`;
  const bis = state.marked === "A" ? -ra / 2 : ((135 - g.angleA / 2) * Math.PI) / 180;
  const thetaLabel = { x: at.x + 54 * Math.cos(bis), y: at.y + 54 * Math.sin(bis) + 6 };

  return (
    <div className="te">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label={vector ? "Vector and its components" : "Right triangle explorer"} data-testid="triangle-explorer">
        {vector && (
          <g aria-hidden="true">
            <line className="v-axis" x1={A.x - 40} x2={W - 30} y1={A.y} y2={A.y} />
            <line className="v-axis" x1={A.x} x2={A.x} y1={A.y + 30} y2={24} />
            <text className="v-text" x={W - 36} y={A.y + 22}>x</text>
            <text className="v-text" x={A.x + 10} y={30}>y</text>
            {state.overlay.shadows && (
              <g data-testid="te-shadows">
                <line x1={A.x} y1={A.y + 1} x2={C.x} y2={A.y + 1} stroke={TONE[roleOf(state.marked, "AC")]} strokeWidth={9} strokeOpacity={0.45} />
                <line x1={A.x - 1} y1={A.y} x2={A.x - 1} y2={B.y} stroke={TONE[roleOf(state.marked, "BC")]} strokeWidth={9} strokeOpacity={0.45} />
                <line x1={B.x} y1={B.y} x2={A.x} y2={B.y} stroke="var(--text-muted)" strokeDasharray="3 5" />
                <text className="v-text" x={(A.x + C.x) / 2} y={A.y + 44} textAnchor="middle">x-shadow</text>
                <text className="v-text" x={A.x - 14} y={(A.y + B.y) / 2} textAnchor="end">y-shadow</text>
              </g>
            )}
          </g>
        )}
        <path d={`M ${C.x - 16} ${C.y} V ${C.y - 16} H ${C.x}`} fill="none" stroke="var(--text-muted)" />
        {seg("AC", A, C, { x: 0, y: 26 })}
        {seg("BC", C, B, { x: 46, y: 0 })}
        {seg("AB", A, B, { x: -26, y: -14 })}
        <path d={arc} fill="none" stroke="var(--accent-orange)" strokeWidth={3} data-testid="te-angle-arc" />
        <text className="v-label-good" x={thetaLabel.x} y={thetaLabel.y} textAnchor="middle" fontSize={18}>θ</text>
        {(["A", "B", "C"] as const).map((v) => {
          const p = v === "A" ? A : v === "B" ? B : C;
          return <text key={v} className="v-text" x={p.x + (v === "A" ? -18 : 12)} y={p.y + (v === "B" ? -10 : 20)}>{v}</text>;
        })}
        {cfg.editable && !state.sweep && (
          <circle cx={B.x} cy={B.y} r={20} className="v-handle" tabIndex={-1} aria-hidden="true" data-testid="te-handle" {...drag} style={{ cursor: "grab" }} fill="var(--accent-orange)" fillOpacity={0.25} stroke="var(--accent-orange)" />
        )}
        {state.showRatios && state.showValues && (
          <g data-testid="te-ratios" transform={`translate(${W - 190} 40)`}>
            {([["sin θ", g.sin], ["cos θ", g.cos], ["tan θ", Math.min(g.tan, 2)]] as const).map(([label, v], i) => (
              <g key={label} transform={`translate(0 ${i * 34})`}>
                <text className="v-text" x={0} y={14}>{label}</text>
                <rect x={52} y={2} width={110} height={14} fill="none" stroke="var(--border)" />
                <rect x={52} y={2} width={110 * Math.min(1, v / (i === 2 ? 2 : 1))} height={14} fill="var(--accent-amber)" />
                <text className="v-text" x={170} y={14}>{fmtNum(i === 2 ? g.tan : v)}</text>
              </g>
            ))}
          </g>
        )}
        {state.overlay.note && <text className="v-label-good" x={20} y={28}>{state.overlay.note}</text>}
      </svg>
      {cfg.editable && (
        <div className="te-controls" role="group" aria-label="Triangle controls">
          <label htmlFor={`${id}-ang`} className="small">Angle at A: {Math.round(angleAt(state, t))}°</label>
          <input id={`${id}-ang`} type="range" min={cfg.angleRange[0]} max={cfg.angleRange[1]} step={cfg.angleStep} value={state.angleDeg} onChange={(e) => dispatch({ type: "set-angle", deg: Number(e.target.value) })} data-testid="te-angle" />
          <div className="answer-row">
            <button type="button" className="btn btn--small" aria-pressed={state.marked === "A"} onClick={() => dispatch({ type: "mark", at: "A" })} data-testid="te-mark-A">Mark θ at A</button>
            <button type="button" className="btn btn--small" aria-pressed={state.marked === "B"} onClick={() => dispatch({ type: "mark", at: "B" })} data-testid="te-mark-B">Mark θ at B</button>
            <label className="choice choice--compact"><input type="checkbox" checked={state.showRatios} onChange={() => dispatch({ type: "toggle-ratios" })} /> <span>Show the ratios</span></label>
          </div>
          <p className="muted small" aria-hidden="true">At {state.marked}: {at === A ? "the side along the bottom" : "the vertical side"} is adjacent to θ.</p>
        </div>
      )}
    </div>
  );
}
