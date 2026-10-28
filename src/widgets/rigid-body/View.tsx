"use client";
import { useCallback, useId, useRef } from "react";
import { arrowHead, fmtNum, useSvgDrag } from "../shared";
import type { BaseAction } from "../types";
import { centreOfMass, circleAt, coilAt, dipoleAt, leverAngleAt, leverTorque, rotorAt, SHAPE_FORMULA, type RBAction, type RBState } from "./model";

const W = 640, H = 340;
type Dispatch = (a: RBAction | BaseAction) => void;
const hl = (s: RBState, id: string) => s.overlay.highlight.includes(id);

export function RigidBodyView({ state, dispatch, t }: { state: RBState; dispatch: Dispatch; t: number }) {
  const m = state.config.mode;
  return (
    <div className="rb">
      {m === "lever" && <Lever state={state} dispatch={dispatch} t={t} />}
      {m === "rotor" && <Rotor state={state} dispatch={dispatch} t={t} />}
      {m === "com" && <Com state={state} dispatch={dispatch} />}
      {m === "dipole" && <Dipole state={state} dispatch={dispatch} />}
      {m === "coil" && <Coil state={state} t={t} />}
      {m === "circle" && <Circle state={state} t={t} />}
    </div>
  );
}

function Lever({ state, dispatch, t }: { state: RBState; dispatch: Dispatch; t: number }) {
  const l = state.config.lever!;
  const svgRef = useRef<SVGSVGElement>(null);
  const id = useId();
  const k = 520 / l.length, x0 = 60, py = 190;
  const ang = leverAngleAt(state, t);
  const X = (x: number) => x0 + x * k;
  const px = X(l.pivot);
  const maxF = Math.max(1, ...state.loads.map((x) => x.force), l.beamWeight);
  const dragging = useRef<string | null>(null);
  const onMove = useCallback((p: { x: number }) => { if (dragging.current) dispatch({ type: "set-load", id: dragging.current, x: Math.round(((p.x - x0) / k) * 20) / 20 }); }, [dispatch, k]);
  const drag = useSvgDrag(svgRef, onMove, () => { dragging.current = null; });
  const tau = leverTorque(state);
  return (
    <>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Beam on a pivot" data-testid="rb-lever">
        <polygon points={`${px},${py + 4} ${px - 18},${py + 40} ${px + 18},${py + 40}`} fill="var(--surface-raised)" stroke="var(--border-strong)" />
        <g transform={`rotate(${-ang} ${px} ${py})`}>
          <rect x={X(0)} y={py - 8} width={l.length * k} height={10} rx={3} fill="var(--surface-raised)" stroke={hl(state, "beam") ? "var(--accent-amber)" : "var(--border-strong)"} />
          {l.beamWeight > 0 && <Arrow x={X(l.length / 2)} y={py} len={(l.beamWeight / maxF) * 90} label={`beam${state.showValues ? ` ${fmtNum(l.beamWeight)} N` : ""}`} tone="var(--text-muted)" />}
          {state.loads.map((x) => (
            <g key={x.id} data-testid={`rb-load-${x.id}`}>
              <Arrow x={X(x.x)} y={py} len={20 + (x.force / maxF) * 90} label={`${x.label}${state.showValues ? ` ${fmtNum(x.force)} N` : ""}`} tone={hl(state, x.id) ? "var(--accent-amber)" : "var(--accent-orange)"} />
              {state.overlay.arms && <g><line x1={px} x2={X(x.x)} y1={py - 22} y2={py - 22} stroke="var(--highlight-peach)" strokeDasharray="4 4" /><text className="v-text" x={(px + X(x.x)) / 2} y={py - 28} textAnchor="middle">{fmtNum(Math.abs(x.x - l.pivot))} m</text></g>}
              {x.editable && <circle cx={X(x.x)} cy={py - 3} r={16} className="vb-handle" {...drag} onPointerDown={(e) => { dragging.current = x.id; drag.onPointerDown(e); }} />}
            </g>
          ))}
        </g>
        <text className={Math.abs(tau) < 1e-9 ? "v-label-good" : "v-label-bad"} x={20} y={28}>{Math.abs(tau) < 1e-9 ? "balanced" : `turns ${tau > 0 ? "anticlockwise" : "clockwise"}`}</text>
        {state.overlay.note && <text className="v-label-good" x={20} y={52}>{state.overlay.note}</text>}
      </svg>
      {state.loads.some((x) => x.editable) && (
        <div className="te-controls" role="group" aria-label="Load controls">
          {state.loads.filter((x) => x.editable).map((x) => (
            <div key={x.id} className="answer-row">
              <label htmlFor={`${id}-${x.id}-x`} className="small">{x.label} position (m from left)</label>
              <input id={`${id}-${x.id}-x`} type="number" step={0.05} min={0} max={l.length} value={x.x} onChange={(e) => e.target.value !== "" && dispatch({ type: "set-load", id: x.id, x: Number(e.target.value) })} data-testid={`rb-x-${x.id}`} />
              <label htmlFor={`${id}-${x.id}-f`} className="small">force (N)</label>
              <input id={`${id}-${x.id}-f`} type="number" step={0.5} min={0} value={x.force} onChange={(e) => e.target.value !== "" && dispatch({ type: "set-load", id: x.id, force: Number(e.target.value) })} data-testid={`rb-f-${x.id}`} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Arrow({ x, y, len, label, tone }: { x: number; y: number; len: number; label: string; tone: string }) {
  return <g><line x1={x} y1={y + 2} x2={x} y2={y + len} stroke={tone} strokeWidth={3} /><polygon points={arrowHead(x, y + 2, x, y + len, 10)} fill={tone} /><text className="v-text" x={x} y={y + len + 16} textAnchor="middle">{label}</text></g>;
}

function Rotor({ state, dispatch, t }: { state: RBState; dispatch: Dispatch; t: number }) {
  const r = state.rotor!;
  const id = useId();
  const q = rotorAt(state, t);
  const cx = 200, cy = 170, R = 110;
  const rod = r.shape.startsWith("rod");
  const deg = (q.theta * 180) / Math.PI;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Rotating body" data-testid="rb-rotor">
        <g transform={`rotate(${-deg} ${cx} ${cy})`}>
          {rod ? <rect x={r.shape === "rod-end" ? cx : cx - R} y={cy - 6} width={r.shape === "rod-end" ? R * 1.6 : 2 * R} height={12} rx={4} fill="var(--surface-raised)" stroke="var(--accent-orange)" />
            : <circle cx={cx} cy={cy} r={R} fill={r.shape === "ring" || r.shape === "hollow-sphere" ? "none" : "var(--surface-raised)"} stroke="var(--accent-orange)" strokeWidth={r.shape === "ring" ? 8 : 3} />}
          <line x1={cx} y1={cy} x2={cx + R} y2={cy} stroke="var(--highlight-peach)" strokeWidth={2} />
        </g>
        <circle cx={cx} cy={cy} r={5} fill="var(--text-primary)" />
        {state.overlay.ghostShape && <text className="v-label-good" x={cx} y={cy + R + 30} textAnchor="middle">compare: {state.overlay.ghostShape} ({SHAPE_FORMULA[state.overlay.ghostShape]})</text>}
        <g transform="translate(380 60)" className="v-text">
          <text y={0}>I = {SHAPE_FORMULA[r.shape]}{state.showValues ? ` = ${fmtNum(q.I)} kg m²` : ""}</text>
          <text y={26}>τ = {fmtNum(r.torque)} N m</text>
          {state.showValues && <><text y={52}>α = {fmtNum(q.alpha)} rad/s²</text><text y={78}>ω = {fmtNum(q.omega)} rad/s</text><text y={104}>L = {fmtNum(q.L)} kg m²/s</text></>}
          {state.overlay.note && <text y={140} className="v-label-good">{state.overlay.note}</text>}
        </g>
      </svg>
      <div className="te-controls" role="group" aria-label="Rotor controls">
        <label htmlFor={`${id}-tau`} className="small">Net torque: {fmtNum(r.torque)} N m</label>
        <input id={`${id}-tau`} type="range" min={-20} max={20} step={0.5} value={r.torque} onChange={(e) => dispatch({ type: "set-rotor", key: "torque", value: Number(e.target.value) })} data-testid="rb-torque" />
      </div>
    </>
  );
}

function Com({ state, dispatch }: { state: RBState; dispatch: Dispatch }) {
  const id = useId();
  const xs = state.masses.map((m) => m.x), ys = state.masses.map((m) => m.y);
  const lo = Math.min(0, ...xs) - 1, hi = Math.max(1, ...xs) + 1, ylo = Math.min(0, ...ys) - 1, yhi = Math.max(1, ...ys) + 1;
  const X = (x: number) => 40 + ((x - lo) / (hi - lo)) * (W - 80), Y = (y: number) => H - 40 - ((y - ylo) / (yhi - ylo)) * (H - 80);
  const cm = centreOfMass(state.masses);
  const maxM = Math.max(...state.masses.map((m) => m.m));
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Point masses and their centre of mass" data-testid="rb-com">
        <line className="v-axis" x1={X(lo)} x2={X(hi)} y1={Y(0)} y2={Y(0)} /><line className="v-axis" x1={X(0)} x2={X(0)} y1={Y(ylo)} y2={Y(yhi)} />
        {state.masses.map((m) => <g key={m.id} data-testid={`rb-mass-${m.id}`}><circle cx={X(m.x)} cy={Y(m.y)} r={8 + 14 * (m.m / maxM)} fill={hl(state, m.id) ? "var(--accent-amber)" : "var(--accent-orange)"} fillOpacity={0.8} /><text className="v-text" x={X(m.x)} y={Y(m.y) - 26} textAnchor="middle">{m.label} {fmtNum(m.m)} kg</text></g>)}
        {(state.overlay.comMarker || state.showValues) && <g data-testid="rb-com-marker"><path d={`M ${X(cm.x) - 9} ${Y(cm.y)} H ${X(cm.x) + 9} M ${X(cm.x)} ${Y(cm.y) - 9} V ${Y(cm.y) + 9}`} stroke="var(--highlight-peach)" strokeWidth={3} /><text className="v-label-good" x={X(cm.x) + 12} y={Y(cm.y) + 22}>centre of mass</text></g>}
        {state.overlay.note && <text className="v-label-good" x={20} y={24}>{state.overlay.note}</text>}
      </svg>
      {state.masses.some((m) => m.editable) && (
        <div className="te-controls" role="group" aria-label="Mass controls">
          {state.masses.filter((m) => m.editable).map((m) => (
            <div key={m.id} className="answer-row">
              <label htmlFor={`${id}-${m.id}`} className="small">{m.label} x (m)</label>
              <input id={`${id}-${m.id}`} type="number" step={0.1} value={m.x} onChange={(e) => e.target.value !== "" && dispatch({ type: "set-mass", id: m.id, x: Number(e.target.value) })} data-testid={`rb-mx-${m.id}`} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Dipole({ state, dispatch }: { state: RBState; dispatch: Dispatch }) {
  const d = state.config.dipole!;
  const id = useId();
  const cx = 260, cy = 170, L = 90;
  const th = (state.angleDeg * Math.PI) / 180;
  const q = dipoleAt(state);
  const e = { x: cx + L * Math.cos(th), y: cy - L * Math.sin(th) };
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Dipole in a uniform field" data-testid="rb-dipole">
        {[60, 120, 180, 240, 300].map((y) => <g key={y}><line x1={40} x2={W - 40} y1={y} y2={y} stroke="var(--border-subtle)" /><polygon points={arrowHead(40, y, W - 40, y, 9)} fill="var(--border-strong)" /></g>)}
        <text className="v-text" x={W - 60} y={44}>{d.kind === "electric" ? "E" : "B"}</text>
        <line x1={cx - (e.x - cx)} y1={cy - (e.y - cy)} x2={e.x} y2={e.y} stroke={hl(state, "p") ? "var(--accent-amber)" : "var(--accent-orange)"} strokeWidth={5} />
        <polygon points={arrowHead(cx, cy, e.x, e.y, 14)} fill="var(--accent-orange)" />
        <path d={`M ${cx + 40} ${cy} A 40 40 0 0 ${state.angleDeg > 0 && state.angleDeg < 180 ? 0 : 1} ${cx + 40 * Math.cos(th)} ${cy - 40 * Math.sin(th)}`} fill="none" stroke="var(--highlight-peach)" />
        <text className="v-text" x={cx + 48} y={cy - 10}>θ = {fmtNum(state.angleDeg)}°</text>
        {state.showValues && <text className="v-text" x={20} y={H - 16}>τ = {fmtNum(Math.abs(q.torque))} N m · U = {fmtNum(q.energy)} J</text>}
        {state.overlay.note && <text className="v-label-good" x={20} y={28}>{state.overlay.note}</text>}
      </svg>
      {d.editableAngle && (
        <div className="te-controls"><label htmlFor={`${id}-a`} className="small">Angle between {d.kind === "electric" ? "p and E" : "m and B"}: {fmtNum(state.angleDeg)}°</label>
          <input id={`${id}-a`} type="range" min={0} max={180} step={5} value={Math.min(180, state.angleDeg)} onChange={(e2) => dispatch({ type: "set-angle", deg: Number(e2.target.value) })} data-testid="rb-angle" /></div>
      )}
    </>
  );
}

function Coil({ state, t }: { state: RBState; t: number }) {
  const k = state.config.coil!;
  const q = coilAt(state, t);
  const T = (k.periods * 2 * Math.PI) / k.omega;
  const gx = 330, gw = 280, gy = 170, gh = 110;
  const pts = Array.from({ length: 121 }, (_, i) => { const tt = (i / 120) * T; return `${i ? "L" : "M"} ${gx + (tt / T) * gw} ${gy - (coilAt(state, tt).emf / q.peak) * (gh / 2)}`; }).join(" ");
  const w = 110 * Math.abs(Math.cos((q.angleDeg * Math.PI) / 180));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Coil rotating in a magnetic field, with its emf graph" data-testid="rb-coil">
      <text className="v-text" x={40} y={40}>B →</text>
      <rect x={160 - w / 2} y={100} width={Math.max(4, w)} height={140} fill="none" stroke="var(--accent-orange)" strokeWidth={4} />
      <text className="v-text" x={160} y={270} textAnchor="middle">coil, seen edge-on as it turns</text>
      <line className="v-axis" x1={gx} x2={gx + gw} y1={gy} y2={gy} />
      <path d={pts} fill="none" stroke="var(--accent-amber)" strokeWidth={2} />
      <line x1={gx + (t / T) * gw} x2={gx + (t / T) * gw} y1={gy - gh / 2} y2={gy + gh / 2} stroke="var(--highlight-peach)" strokeDasharray="3 4" />
      <text className="v-text" x={gx} y={gy - gh / 2 - 8}>emf{state.showValues ? ` (peak ${fmtNum(q.peak)} V)` : ""}</text>
      {state.overlay.note && <text className="v-label-good" x={20} y={H - 16}>{state.overlay.note}</text>}
    </svg>
  );
}

function Circle({ state, t }: { state: RBState; t: number }) {
  const k = state.config.circle!;
  const q = circleAt(state, t);
  const cx = 220, cy = 170, R = 120;
  const px = cx + R * Math.cos(q.theta), py = cy - R * Math.sin(q.theta);
  const vx = -Math.sin(q.theta), vy = -Math.cos(q.theta);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Uniform circular motion" data-testid="rb-circle">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border-strong)" strokeDasharray="5 5" />
      <circle cx={cx} cy={cy} r={4} fill="var(--text-muted)" />
      <line x1={px} y1={py} x2={px + vx * 70} y2={py + vy * 70} stroke={hl(state, "v") ? "var(--accent-amber)" : "var(--accent-orange)"} strokeWidth={3} />
      <polygon points={arrowHead(px, py, px + vx * 70, py + vy * 70, 10)} fill="var(--accent-orange)" />
      <text className="v-text" x={px + vx * 78} y={py + vy * 78}>v</text>
      <line x1={px} y1={py} x2={px + (cx - px) * 0.45} y2={py + (cy - py) * 0.45} stroke={hl(state, "a") ? "var(--accent-amber)" : "var(--highlight-peach)"} strokeWidth={3} />
      <polygon points={arrowHead(px, py, px + (cx - px) * 0.45, py + (cy - py) * 0.45, 10)} fill="var(--highlight-peach)" />
      <circle cx={px} cy={py} r={10} fill="var(--accent-orange)" />
      <g transform="translate(400 80)" className="v-text">
        <text y={0}>r = {fmtNum(k.radius)} m, v = {fmtNum(k.speed)} m/s</text>
        {state.showValues && <><text y={26}>ω = {fmtNum(q.omega)} rad/s, T = {fmtNum(q.period)} s</text><text y={52}>a = v²/r = {fmtNum(q.ac)} m/s²</text></>}
        {state.overlay.note && <text y={86} className="v-label-good">{state.overlay.note}</text>}
      </g>
    </svg>
  );
}
