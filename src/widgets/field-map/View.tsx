"use client";
import { useId, type MouseEvent } from "react";
import { fmtNum } from "../shared";
import type { BaseAction } from "../types";
import { equipotentialContours, fieldAt, inductionAt, particleAt, particleOf, platesOf, sci, wireField, type FMAction, type FMState } from "./model";

const W = 640, H = 360, PAD = 36;
type Dispatch = (a: FMAction | BaseAction) => void;
export function FieldMapView({ state, dispatch, t }: { state: FMState; dispatch: Dispatch; t: number }) {
  const id = useId(), e = state.config.extent;
  const X = (x: number) => PAD + ((x + e) / (2 * e)) * (W - 2 * PAD), Y = (y: number) => H - PAD - ((y + e) / (2 * e)) * (H - 2 * PAD);
  const point = (ev: MouseEvent<SVGSVGElement>) => { const r = ev.currentTarget.getBoundingClientRect(); dispatch({ type: "probe", x: (((ev.clientX - r.left) / r.width) * 2 - 1) * e, y: (1 - ((ev.clientY - r.top) / r.height) * 2) * e }); };
  const charges = state.charges;
  const arrows = state.field && state.config.mode === "charges" ? Array.from({ length: 8 }, (_, j) => Array.from({ length: 11 }, (_, i) => {
    const x = -e * .88 + (i * e * 1.76) / 10, y = -e * .78 + (j * e * 1.56) / 7, f = fieldAt(charges, x, y);
    const scale = Math.min(16, 2 + 3 * Math.log10(1 + f.E / Math.max(1, Math.abs(fieldAt(charges, e * .8, 0).E))));
    return f.E > 0 && Number.isFinite(scale) ? <line key={`${i}-${j}`} x1={X(x)} y1={Y(y)} x2={X(x) + (f.Ex / f.E) * scale} y2={Y(y) - (f.Ey / f.E) * scale} className="v-axis" strokeWidth={1.5} /> : null;
  })) : null;
  const contours = state.potential && state.config.mode === "charges" ? equipotentialContours(charges, e).map((s, i) => <line key={i} x1={X(s.x1)} y1={Y(s.y1)} x2={X(s.x2)} y2={Y(s.y2)} stroke="var(--highlight-peach)" strokeWidth={1} opacity={.75} />) : null;
  const p = state.probe, probe = p && state.config.mode === "charges" ? fieldAt(charges, p.x, p.y) : null;
  return <div className="fm">
    <svg viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Electric and magnetic field map" data-testid="field-map" onClick={point}>
      <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} fill="var(--surface-raised)" stroke="var(--border-strong)" />
      {arrows}{contours}
      {state.config.mode === "charges" && charges.map((q) => <g key={q.id}><circle cx={X(q.x)} cy={Y(q.y)} r={13} fill={q.q >= 0 ? "var(--accent-coral)" : "var(--accent-blue)"} /><text x={X(q.x)} y={Y(q.y) + 5} textAnchor="middle" fill="white">{q.q >= 0 ? "+" : "−"}</text><text className="v-text" x={X(q.x)} y={Y(q.y) - 20} textAnchor="middle">{q.label ?? q.id}</text></g>)}
      {state.config.mode === "charges" && p && <g><circle cx={X(p.x)} cy={Y(p.y)} r={5} fill="var(--accent-amber)" /><text className="v-text" x={X(p.x) + 8} y={Y(p.y) - 8}>{probe ? `E ${sci(probe.E)} N/C, V ${sci(probe.V)} V` : "probe"}</text></g>}
      {state.config.mode === "plates" && <Plates state={state} X={X} Y={Y} />}
      {state.config.mode === "particle" && <Particle state={state} t={t} X={X} Y={Y} />}
      {state.config.mode === "wires" && <Wires state={state} X={X} Y={Y} />}
      {state.config.mode === "induction" && <Induction state={state} t={t} />}
      {state.overlay.note && <text className="v-label-good" x={16} y={22}>{state.overlay.note}</text>}
    </svg>
    <div className="te-controls" role="group" aria-label="Field map controls">
      <button type="button" className="btn btn--small" onClick={() => dispatch({ type: "cue", cue: "field" })}>Field arrows</button><button type="button" className="btn btn--small" onClick={() => dispatch({ type: "cue", cue: "potential" })}>Equipotentials</button>
      {state.config.mode === "charges" && <span className="small">Click a point on the map to place the non-drag probe.</span>}
      {Object.entries(state.p).filter(([k]) => ["V", "d", "v", "B", "rate", "angleDeg"].includes(k)).map(([k, value]) => <label key={k} htmlFor={`${id}-${k}`} className="small">{k}<input id={`${id}-${k}`} type="number" step="any" value={value} onChange={(ev) => ev.target.value !== "" && dispatch({ type: "set", key: k, value: Number(ev.target.value) })} /></label>)}
    </div>
  </div>;
}
function Plates({ state, X, Y }: { state: FMState; X: (x: number) => number; Y: (y: number) => number }) { const q = platesOf(state.p); return <><line x1={X(-state.p.d! / 2)} x2={X(-state.p.d! / 2)} y1={Y(-.8 * state.config.extent)} y2={Y(.8 * state.config.extent)} stroke="var(--accent-blue)" strokeWidth={9} /><line x1={X(state.p.d! / 2)} x2={X(state.p.d! / 2)} y1={Y(-.8 * state.config.extent)} y2={Y(.8 * state.config.extent)} stroke="var(--accent-coral)" strokeWidth={9} />{state.field && Array.from({ length: 7 }, (_, i) => <line key={i} x1={X(-state.p.d! / 2 + .03)} x2={X(state.p.d! / 2 - .03)} y1={Y(-.65 * state.config.extent + i * state.config.extent * 1.3 / 6)} y2={Y(-.65 * state.config.extent + i * state.config.extent * 1.3 / 6)} className="v-axis" />)}<text className="v-text" x={30} y={30}>E = {sci(q.E)} V/m; C = {sci(q.C)} F</text></>; }
function Particle({ state, t, X, Y }: { state: FMState; t: number; X: (x: number) => number; Y: (y: number) => number }) { const q = particleAt(state.p, t), r = particleOf(state.p); return <><circle cx={X(0)} cy={Y(q.sense * r.r)} r={Math.abs(X(r.r) - X(0))} fill="none" stroke="var(--border-strong)" strokeDasharray="5 4" /><circle cx={X(q.x)} cy={Y(q.y)} r={9} fill="var(--accent-orange)" /><text className="v-text" x={24} y={28}>r = {sci(r.r)} m; qv × B</text></>; }
function Wires({ state, X, Y }: { state: FMState; X: (x: number) => number; Y: (y: number) => number }) { const p = state.probe, b = p ? wireField(state.config.wires, p.x, p.y) : null; return <>{state.config.wires.map((w) => <g key={w.id}><circle cx={X(w.x)} cy={Y(w.y)} r={12} fill="var(--surface)" stroke="var(--accent-orange)" strokeWidth={3} /><text x={X(w.x)} y={Y(w.y) + 5} textAnchor="middle">{w.I >= 0 ? "⊙" : "⊗"}</text></g>)}{p && <text className="v-text" x={30} y={30}>B at probe = {sci(b!.B)} T</text>}</>; }
function Induction({ state, t }: { state: FMState; t: number }) { const q = inductionAt(state.config.induction!, state.p, t); return <g><rect x={90} y={90} width={170} height={150} fill="none" stroke="var(--accent-orange)" strokeWidth={4} /><text className="v-text" x={300} y={130}>Φ = {sci(q.flux)} Wb</text><text className="v-text" x={300} y={160}>emf = {sci(q.emf)} V</text><text className="v-text" x={300} y={190}>I = {sci(q.I)} A</text></g>; }
