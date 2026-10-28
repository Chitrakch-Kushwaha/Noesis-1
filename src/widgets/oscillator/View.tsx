"use client";
import { useId } from "react";
import { fmtNum } from "../shared";
import type { BaseAction } from "../types";
import { durationOf, stateAt, type OSAction, type OSState } from "./model";

const W = 640, H = 360;
type Dispatch = (a: OSAction | BaseAction) => void;
const LABEL = { amplitude: "Amplitude (m)", mass: "Mass (kg)", k: "Spring constant (N/m)", length: "Length (m)", phaseDeg: "Phase (°)" } as const;

export function OscillatorView({ state, dispatch, t }: { state: OSState; dispatch: Dispatch; t: number }) {
  const c = state.config, q = stateAt(state, t);
  const id = useId();
  const A = state.p.amplitude, k = 120 / Math.max(A, 1e-6);
  const T = durationOf(state);
  const hl = (x: string) => state.overlay.highlight.includes(x);
  // left: the system; right: reference circle; bottom: x–t graph; corner: energy bars
  const bx = 170 + q.x * k * 0.9;
  const graph = (p = state.p) => Array.from({ length: 161 }, (_, i) => { const tt = (i / 160) * T; return `${i ? "L" : "M"} ${40 + (tt / T) * 560} ${300 - (stateAt(state, tt, p).x / A) * 40}`; }).join(" ");
  const ghostP = state.overlay.ghost ? { ...state.p, [state.overlay.ghost.key]: state.overlay.ghost.value } : null;
  const ph = q.phase, pcx = 460, pcy = 120, pr = 70;
  return (
    <div className="osc">
      <svg viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label={c.system === "spring" ? "Spring–mass oscillator" : "Simple pendulum"} data-testid="oscillator">
        {c.system === "spring" ? (
          <g>
            <line x1={20} x2={20} y1={80} y2={160} stroke="var(--border-strong)" strokeWidth={4} />
            <path d={`M 20 120 ${Array.from({ length: 10 }, (_, i) => `L ${20 + ((bx - 40) * (i + 0.5)) / 10} ${i % 2 ? 108 : 132}`).join(" ")} L ${bx - 20} 120`} fill="none" stroke={hl("spring") ? "var(--accent-amber)" : "var(--text-muted)"} strokeWidth={2} />
            <rect x={bx - 20} y={98} width={44} height={44} rx={4} fill="var(--accent-orange)" />
            <line x1={170} x2={170} y1={150} y2={170} stroke="var(--highlight-peach)" /><text className="v-text" x={170} y={186} textAnchor="middle">x = 0</text>
          </g>
        ) : (
          <g>
            {(() => { const ang = q.x / state.p.length; const L = 130; const ex = 170 + L * Math.sin(ang), ey = 30 + L * Math.cos(ang); return <><line x1={120} x2={220} y1={30} y2={30} stroke="var(--border-strong)" strokeWidth={4} /><line x1={170} y1={30} x2={ex} y2={ey} stroke="var(--text-muted)" strokeWidth={2} /><circle cx={ex} cy={ey} r={14} fill="var(--accent-orange)" /><line x1={170} x2={170} y1={30} y2={175} stroke="var(--border-subtle)" strokeDasharray="4 4" /></>; })()}
          </g>
        )}
        <g data-testid="osc-phasor">
          <circle cx={pcx} cy={pcy} r={pr} fill="none" stroke={hl("phasor") ? "var(--accent-amber)" : "var(--border-strong)"} />
          <line x1={pcx} y1={pcy} x2={pcx + pr * Math.cos(ph)} y2={pcy - pr * Math.sin(ph)} stroke="var(--accent-orange)" strokeWidth={3} />
          <line x1={pcx + pr * Math.cos(ph)} y1={pcy - pr * Math.sin(ph)} x2={pcx + pr * Math.cos(ph)} y2={pcy + pr + 10} stroke="var(--highlight-peach)" strokeDasharray="3 4" />
          <text className="v-text" x={pcx} y={pcy + pr + 26} textAnchor="middle">reference circle: x is the shadow</text>
        </g>
        <g data-testid="osc-energy" transform="translate(580 40)">
          {[["KE", q.ke], ["PE", q.pe]].map(([l, e], i) => <g key={String(l)} transform={`translate(${i * 26} 0)`}><rect x={0} y={0} width={18} height={120} fill="none" stroke="var(--border-strong)" /><rect x={0} y={120 - (Number(e) / Math.max(q.total, 1e-9)) * 120} width={18} height={(Number(e) / Math.max(q.total, 1e-9)) * 120} fill={hl("energy") ? "var(--accent-amber)" : i ? "var(--highlight-peach)" : "var(--accent-orange)"} /><text className="v-text" x={9} y={138} textAnchor="middle">{String(l)}</text></g>)}
        </g>
        <line className="v-axis" x1={40} x2={600} y1={300} y2={300} />
        <path d={graph()} fill="none" stroke={hl("x") ? "var(--accent-amber)" : "var(--accent-orange)"} strokeWidth={2} />
        {ghostP && <path d={graph(ghostP)} fill="none" stroke="var(--highlight-peach)" strokeWidth={2} strokeDasharray="6 5" data-testid="osc-ghost" />}
        <line x1={40 + (t / T) * 560} x2={40 + (t / T) * 560} y1={252} y2={348} stroke="var(--highlight-peach)" strokeDasharray="3 4" />
        {state.overlay.marker !== null && <line x1={40 + (state.overlay.marker / T) * 560} x2={40 + (state.overlay.marker / T) * 560} y1={252} y2={348} stroke="var(--accent-amber)" strokeWidth={2} />}
        <text className="v-text" x={40} y={248}>x–t{state.showValues ? ` (period ${fmtNum(q.period)} s)` : ""}</text>
        {state.overlay.note && <text className="v-label-good" x={250} y={248}>{state.overlay.note}</text>}
      </svg>
      {c.editable.length > 0 && (
        <div className="te-controls" role="group" aria-label="Oscillator controls">
          {c.editable.map((key) => (
            <div key={key} className="answer-row">
              <label htmlFor={`${id}-${key}`} className="small">{LABEL[key]}</label>
              <input id={`${id}-${key}`} type="number" step={key === "phaseDeg" ? 15 : 0.1} value={state.p[key]} onChange={(e) => e.target.value !== "" && dispatch({ type: "set", key, value: Number(e.target.value) })} data-testid={`osc-${key}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
