"use client";
import { useCallback, useId, useMemo, useRef, type KeyboardEvent } from "react";
import { arrowHead, fmtNum, useSvgDrag } from "../shared";
import { axisComponents, components, predicted, resultant, type VBAction, type VBState, type Vec } from "./model";
import type { BaseAction } from "../types";

const W = 640, H = 420;
type Dispatch = (a: VBAction | BaseAction) => void;

export function VectorBoardView({ state, dispatch, t }: { state: VBState; dispatch: Dispatch; t: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const cfg = state.config;
  const grid = cfg.scene === "grid";
  const origin = { x: W / 2, y: grid ? H / 2 : H / 2 + 10 };
  const scale = grid ? 26 : 150 / cfg.maxMagnitude; // px per unit
  const toScreen = (fx: number, fy: number) => ({ x: origin.x + fx * scale, y: origin.y - fy * scale });

  // predicted motion of the body (and of the comparison set) at time t
  const mass = cfg.body?.mass ?? 1;
  const v0 = cfg.initialVelocity;
  const pNow = predicted(state.vectors, mass, t, v0);
  const pCmp = state.overlay.compare ? predicted(state.overlay.compare, mass, t, v0) : null;
  const T = cfg.predictSeconds;
  const reach = (p: ReturnType<typeof predicted>) => Math.hypot(v0.x * T + 0.5 * p.ax * T * T, v0.y * T + 0.5 * p.ay * T * T);
  const maxDisp = Math.max(reach(predicted(state.vectors, mass, T, v0)), pCmp ? reach(predicted(state.overlay.compare!, mass, T, v0)) : 0, 1e-9);
  const pxPerM = Math.min(60, 140 / maxDisp);
  const bodyOffset = cfg.predict ? { x: pNow.dx * pxPerM, y: -pNow.dy * pxPerM } : { x: 0, y: 0 };
  const cmpOffset = pCmp ? { x: pCmp.dx * pxPerM, y: -pCmp.dy * pxPerM } : null;

  const r = resultant(state.vectors);
  const theta = cfg.inclineDeg ?? 0;

  return (
    <div className="vb">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label={grid ? "Vector board" : `Force board for ${cfg.body?.label ?? "the body"}`} data-testid="vector-board">
        <defs>
          <pattern id="vb-grid" width={grid ? scale : 24} height={grid ? scale : 24} patternUnits="userSpaceOnUse" x={origin.x} y={origin.y}>
            <path d={`M ${grid ? scale : 24} 0 H 0 V ${grid ? scale : 24}`} fill="none" stroke="var(--grid-line)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#vb-grid)" />
        <Scene cfg={cfg} origin={origin} theta={theta} />
        {state.axes === "tilted" && <TiltedAxes origin={origin} theta={theta} />}
        {grid && <GridAxes origin={origin} />}

        {/* comparison body (dashed) and its forces */}
        {cmpOffset && !grid && (
          <g opacity={0.9} data-testid="vb-compare">
            <Body cfg={cfg} x={origin.x + cmpOffset.x} y={origin.y + cmpOffset.y} theta={theta} ghost />
            <text className="v-label-good" x={origin.x + cmpOffset.x} y={origin.y + cmpOffset.y + 52} textAnchor="middle">{state.overlay.compareLabel}</text>
          </g>
        )}
        {!grid && cfg.body && <Body cfg={cfg} x={origin.x + bodyOffset.x} y={origin.y + bodyOffset.y} theta={theta} />}
        {cfg.predict && t > 0 && pNow.at > 1e-6 && (
          <line x1={origin.x} y1={origin.y} x2={origin.x + bodyOffset.x} y2={origin.y + bodyOffset.y} stroke="var(--accent-coral)" strokeDasharray="4 5" strokeWidth={2} />
        )}

        <g transform={`translate(${bodyOffset.x} ${bodyOffset.y})`}>
          {state.overlay.compare?.map((v, i) => {
            const c = components(v), e = toScreen(c.x, c.y);
            return <g key={`c${i}`} opacity={0.75}>
              <line x1={origin.x} y1={origin.y} x2={e.x} y2={e.y} stroke="var(--accent-amber)" strokeWidth={2} strokeDasharray="6 5" />
              <polygon points={arrowHead(origin.x, origin.y, e.x, e.y, 9)} fill="var(--accent-amber)" />
            </g>;
          })}
          {state.vectors.map((v) => (
            <Arrow key={v.id} v={v} state={state} origin={origin} scale={scale} toScreen={toScreen} svgRef={svgRef} dispatch={dispatch} theta={theta} />
          ))}
          {cfg.showResultant && r.magnitude > 1e-9 && (() => {
            const e = toScreen(r.x, r.y);
            return <g data-testid="vb-resultant">
              <line x1={origin.x} y1={origin.y} x2={e.x} y2={e.y} stroke="var(--accent-amber)" strokeWidth={5} strokeOpacity={0.45} />
              <line x1={origin.x} y1={origin.y} x2={e.x} y2={e.y} stroke="var(--accent-amber)" strokeWidth={2} strokeDasharray="10 6" />
              <polygon points={arrowHead(origin.x, origin.y, e.x, e.y, 13)} fill="var(--accent-amber)" />
              <text className="v-label-good" x={e.x + 10} y={e.y + (Math.abs(e.y - origin.y) < 30 ? 26 : -8)}>{grid ? "a + b" : "net"} {fmtNum(r.magnitude)} {cfg.unit}</text>
            </g>;
          })()}
          {state.overlay.project && <Projection state={state} toScreen={toScreen} origin={origin} />}
        </g>

        {state.overlay.meter && <Meter m={state.overlay.meter} />}
        <text className="v-text" x={14} y={H - 14} data-testid="vb-readout">
          {grid ? `|a + b| = ${fmtNum(r.magnitude)}` : `Net force ${fmtNum(r.magnitude)} ${cfg.unit}`}
          {cfg.predict && cfg.body ? ` · a = ${fmtNum(pNow.at)} m/s²${pNow.at < 1e-6 ? (Math.hypot(v0.x, v0.y) > 0 ? " (constant velocity)" : " (stays at rest)") : ""}${Math.hypot(v0.x, v0.y) > 0 ? ` · speed ${fmtNum(pNow.speed)} m/s` : ""}` : ""}
        </text>
      </svg>
      <PreciseControls state={state} dispatch={dispatch} />
    </div>
  );
}

function Scene({ cfg, origin, theta }: { cfg: VBState["config"]; origin: { x: number; y: number }; theta: number }) {
  if (cfg.scene === "floor") {
    const ra = ((cfg.rope?.angleDeg ?? 0) * Math.PI) / 180;
    return <g>
      <line x1={20} x2={W - 20} y1={origin.y + 30} y2={origin.y + 30} stroke="var(--border-strong)" strokeWidth={3} />
      <text className="v-text" x={W - 24} y={origin.y + 50} textAnchor="end">floor</text>
      {cfg.rope && <line x1={origin.x + 30} y1={origin.y - 30 * Math.tan(ra) * 0} x2={origin.x + 30 + 260 * Math.cos(ra)} y2={origin.y - 260 * Math.sin(ra)} stroke="#8a6a4a" strokeWidth={3} strokeDasharray="2 3" data-testid="vb-rope" />}
      {Math.hypot(cfg.initialVelocity.x, cfg.initialVelocity.y) > 0 && <text className="v-text" x={24} y={origin.y + 50}>moving at {fmtNum(Math.hypot(cfg.initialVelocity.x, cfg.initialVelocity.y))} m/s →</text>}
    </g>;
  }
  if (cfg.scene === "incline") {
    const a = (theta * Math.PI) / 180, L = 300;
    const dx = Math.cos(a) * L, dy = Math.sin(a) * L;
    const ox = origin.x + 30 * Math.sin(a), oy = origin.y + 30 * Math.cos(a); // plank surface just under the block
    return <g>
      <polygon points={`${ox - dx},${oy + dy} ${ox + dx},${oy - dy} ${ox + dx},${oy + dy}`} fill="var(--well-raised)" stroke="var(--border-strong)" strokeWidth={2} />
      <text className="v-text" x={ox - dx + 60} y={oy + dy - 8}>θ = {fmtNum(theta)}°</text>
    </g>;
  }
  if (cfg.scene === "hanging") return <g><line x1={origin.x} x2={origin.x} y1={20} y2={origin.y - 28} stroke="var(--text-muted)" strokeWidth={2} /><line x1={origin.x - 80} x2={origin.x + 80} y1={20} y2={20} stroke="var(--border-strong)" strokeWidth={4} /></g>;
  return null;
}

function Body({ cfg, x, y, theta, ghost = false }: { cfg: VBState["config"]; x: number; y: number; theta: number; ghost?: boolean }) {
  const rot = cfg.scene === "incline" ? -theta : 0;
  return <g transform={`translate(${x} ${y}) rotate(${rot})`} data-testid={ghost ? undefined : "vb-body"}>
    <rect x={-30} y={-28} width={60} height={56} rx={7} fill={ghost ? "none" : "var(--surface-raised)"} stroke={ghost ? "var(--accent-amber)" : "var(--highlight-peach)"} strokeDasharray={ghost ? "6 5" : undefined} strokeWidth={2} />
    {!ghost && <text className="v-strong" y={5} textAnchor="middle" style={{ fontSize: 12 }}>{cfg.body?.label}</text>}
  </g>;
}

function TiltedAxes({ origin, theta }: { origin: { x: number; y: number }; theta: number }) {
  const a = (theta * Math.PI) / 180, L = 200;
  return <g opacity={0.6} data-testid="vb-tilted-axes">
    <line x1={origin.x - L * Math.cos(a)} y1={origin.y + L * Math.sin(a)} x2={origin.x + L * Math.cos(a)} y2={origin.y - L * Math.sin(a)} stroke="var(--highlight-peach)" strokeDasharray="3 6" />
    <line x1={origin.x - L * Math.sin(a)} y1={origin.y - L * Math.cos(a)} x2={origin.x + L * Math.sin(a)} y2={origin.y + L * Math.cos(a)} stroke="var(--highlight-peach)" strokeDasharray="3 6" />
    <text className="v-text" x={origin.x + (L - 10) * Math.cos(a)} y={origin.y - (L - 10) * Math.sin(a) - 8}>along slope</text>
  </g>;
}

function GridAxes({ origin }: { origin: { x: number; y: number } }) {
  return <g><line className="v-axis" x1={10} x2={W - 10} y1={origin.y} y2={origin.y} /><line className="v-axis" x1={origin.x} x2={origin.x} y1={10} y2={H - 10} /></g>;
}

function Arrow({ v, state, origin, scale, toScreen, svgRef, dispatch, theta }: {
  v: Vec; state: VBState; origin: { x: number; y: number }; scale: number; toScreen: (x: number, y: number) => { x: number; y: number };
  svgRef: React.RefObject<SVGSVGElement | null>; dispatch: Dispatch; theta: number;
}) {
  const cfg = state.config;
  const c = components(v), e = toScreen(c.x, c.y);
  const hl = state.overlay.highlight.includes(v.id);
  const editable = cfg.allowEdit && !v.locked;
  const color = v.tone === "a" ? "var(--accent-orange)" : v.tone === "b" ? "var(--accent-amber)" : v.agent === "none" ? "var(--accent-coral)" : "var(--text-primary)";
  const onMove = useCallback((p: { x: number; y: number }) => dispatch({ type: "drag-to", id: v.id, fx: (p.x - origin.x) / scale, fy: (origin.y - p.y) / scale }), [dispatch, v.id, origin.x, origin.y, scale]);
  const drag = useSvgDrag(svgRef, onMove);
  const fine = (e: KeyboardEvent) => (e.shiftKey ? 0.2 : 1);
  const onKey = (e: KeyboardEvent<SVGElement>) => {
    if (!editable) return;
    const step = cfg.magnitudeStep, ang = cfg.angleStep;
    const map: Record<string, VBAction | null> = {
      ArrowLeft: { type: "rotate", id: v.id, delta: ang * fine(e) },
      ArrowRight: { type: "rotate", id: v.id, delta: -ang * fine(e) },
      ArrowUp: { type: "scale", id: v.id, delta: step * fine(e) },
      ArrowDown: { type: "scale", id: v.id, delta: -step * fine(e) },
      PageUp: { type: "scale", id: v.id, delta: step * 5 },
      PageDown: { type: "scale", id: v.id, delta: -step * 5 },
      Delete: cfg.allowAdd ? { type: "remove", id: v.id } : null,
      Backspace: cfg.allowAdd ? { type: "remove", id: v.id } : null,
    };
    const act = map[e.key];
    if (act !== undefined) { e.preventDefault(); if (act) dispatch(act); }
  };
  const decomp = state.overlay.decompose === v.id || state.showComponents;
  const ax = decomp ? axisComponents(v, state.axes, theta) : null;
  const symbolic = state.overlay.decompose === v.id && !state.overlay.decomposeValues && !state.showComponents;
  return (
    <g data-vector={v.id}>
      {ax && (() => {
        const a = (ax.axisAngleDeg * Math.PI) / 180;
        const along = { x: ax.along * Math.cos(a), y: ax.along * Math.sin(a) };
        const pe = toScreen(along.x, along.y);
        return <g data-testid={`vb-components-${v.id}`}>
          <line x1={origin.x} y1={origin.y} x2={pe.x} y2={pe.y} stroke="var(--highlight-peach)" strokeWidth={2} strokeDasharray="5 4" />
          <line x1={pe.x} y1={pe.y} x2={e.x} y2={e.y} stroke="var(--highlight-peach)" strokeWidth={2} strokeDasharray="5 4" />
          <text className="v-label-good" x={pe.x + 6} y={pe.y + 16}>{symbolic ? (state.axes === "tilted" ? `${v.label} sin θ` : `${v.label} x-part`) : fmtNum(Math.abs(ax.along))}</text>
          <text className="v-label-good" x={(pe.x + e.x) / 2 + 6} y={(pe.y + e.y) / 2}>{symbolic ? (state.axes === "tilted" ? `${v.label} cos θ` : `${v.label} y-part`) : fmtNum(Math.abs(ax.perp))}</text>
        </g>;
      })()}
      {hl && <line x1={origin.x} y1={origin.y} x2={e.x} y2={e.y} stroke="var(--accent-coral)" strokeWidth={10} strokeOpacity={0.35} strokeLinecap="round" />}
      <line x1={origin.x} y1={origin.y} x2={e.x} y2={e.y} stroke={color} strokeWidth={3} strokeDasharray={v.agent === "none" ? "4 4" : undefined} />
      {v.magnitude > 1e-9 && <polygon points={arrowHead(origin.x, origin.y, e.x, e.y)} fill={color} />}
      <text className="v-strong" x={e.x + (c.x >= 0 ? 10 : -10)} y={e.y + (c.y >= 0 ? -10 : 18)} textAnchor={c.x >= 0 ? "start" : "end"}>
        {v.label} {fmtNum(v.magnitude)}{cfg.unit ? ` ${cfg.unit}` : ""}
      </text>
      {editable && (
        <circle
          cx={e.x} cy={e.y} r={20}
          className="vb-handle"
          tabIndex={0}
          role="slider"
          aria-label={`${v.label} arrow tip. Left and right arrows rotate, up and down change size${cfg.allowAdd ? ", Delete removes it" : ""}.`}
          aria-valuemin={0}
          aria-valuemax={cfg.maxMagnitude}
          aria-valuenow={v.magnitude}
          aria-valuetext={`${fmtNum(v.magnitude)} ${cfg.unit} at ${Math.round(v.angleDeg)} degrees`}
          data-testid={`vb-handle-${v.id}`}
          onKeyDown={onKey}
          onFocus={() => dispatch({ type: "select", id: v.id })}
          {...drag}
        />
      )}
    </g>
  );
}

function Projection({ state, toScreen, origin }: { state: VBState; toScreen: (x: number, y: number) => { x: number; y: number }; origin: { x: number; y: number } }) {
  const a = state.vectors.find((v) => v.id === state.overlay.project!.a), b = state.vectors.find((v) => v.id === state.overlay.project!.b);
  if (!a || !b) return null;
  const ca = components(a), cb = components(b);
  const bb = cb.x * cb.x + cb.y * cb.y;
  const k = (ca.x * cb.x + ca.y * cb.y) / bb;
  const foot = toScreen(k * cb.x, k * cb.y), tip = toScreen(ca.x, ca.y);
  return <g data-testid="vb-projection">
    <line x1={tip.x} y1={tip.y} x2={foot.x} y2={foot.y} stroke="var(--highlight-peach)" strokeDasharray="5 4" strokeWidth={2} />
    <line x1={origin.x} y1={origin.y} x2={foot.x} y2={foot.y} stroke="var(--accent-orange)" strokeWidth={7} strokeOpacity={0.5} />
  </g>;
}

function Meter({ m }: { m: NonNullable<VBState["overlay"]["meter"]> }) {
  const max = Math.max(m.needed, m.available) * 1.15, w = 180;
  return <g transform={`translate(${W - w - 24} 20)`} data-testid="vb-meter">
    <text className="v-text" x={0} y={0}>{m.label}: needed vs available</text>
    <rect x={0} y={10} width={w} height={12} rx={3} fill="var(--surface-raised)" />
    <rect x={0} y={10} width={(m.needed / max) * w} height={12} rx={3} fill="var(--accent-orange)" />
    <rect x={0} y={28} width={w} height={12} rx={3} fill="var(--surface-raised)" />
    <rect x={0} y={28} width={(m.available / max) * w} height={12} rx={3} fill="var(--accent-amber)" opacity={0.6} />
    <text className="v-text" x={w + 6} y={21}>{m.showValues ? `${fmtNum(m.needed)} N` : "needed"}</text>
    <text className="v-text" x={w + 6} y={39}>{m.showValues ? `max ${fmtNum(m.available)} N` : "most available"}</text>
  </g>;
}

/** Non-drag controls that drive the same model: add, edit, delete, axes. */
function PreciseControls({ state, dispatch }: { state: VBState; dispatch: Dispatch }) {
  const cfg = state.config;
  const id = useId();
  const kindRef = useRef<HTMLSelectElement>(null);
  const agentRef = useRef<HTMLSelectElement>(null);
  const editable = state.vectors.filter((v) => !v.locked);
  const hasControls = cfg.allowEdit && (editable.length > 0 || cfg.allowAdd);
  const agents = useMemo(() => cfg.agents, [cfg.agents]);
  return (
    <details className="precise" open>
      <summary>Precise controls <span className="muted">(keyboard and form alternative to dragging)</span></summary>
      <p className="muted precise__help">Drag an arrow tip, or focus it and use the arrow keys (Shift for fine steps). You can also type values below.</p>
      {cfg.allowAdd && (
        <div className="precise__row" role="group" aria-label="Add a force">
          <label htmlFor={`${id}-kind`}>Add</label>
          <select id={`${id}-kind`} ref={kindRef} data-testid="vb-add-kind">{cfg.kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}</select>
          {agents.length > 0 && (
            <>
              <label htmlFor={`${id}-agent`}>from</label>
              <select id={`${id}-agent`} ref={agentRef} data-testid="vb-add-agent">{agents.map((a) => <option key={a} value={a}>{a === "none" ? "no agent" : a}</option>)}</select>
            </>
          )}
          <button type="button" className="btn" data-testid="vb-add" onClick={() => dispatch({ type: "add", kind: kindRef.current!.value, agent: agentRef.current?.value ?? "none" })}>Add force</button>
        </div>
      )}
      {cfg.allowEdit && editable.map((v) => (
        <fieldset key={v.id} className="precise__row" data-testid={`vb-row-${v.id}`}>
          <legend>{v.label}</legend>
          <label>Size <input type="number" inputMode="decimal" min={0} max={cfg.maxMagnitude} step={cfg.magnitudeStep} value={round2(v.magnitude)}
            onChange={(e) => e.target.value !== "" && dispatch({ type: "set", id: v.id, magnitude: Number(e.target.value) })} data-testid={`vb-mag-${v.id}`} /> {cfg.unit}</label>
          <label>Direction <input type="number" inputMode="decimal" step={cfg.angleStep} value={round2(v.angleDeg)}
            onChange={(e) => e.target.value !== "" && dispatch({ type: "set", id: v.id, angleDeg: Number(e.target.value) })} data-testid={`vb-ang-${v.id}`} />°</label>
          {cfg.allowAdd && agents.length > 0 && (
            <label>Agent <select value={v.agent ?? "none"} onChange={(e) => dispatch({ type: "set", id: v.id, agent: e.target.value })} data-testid={`vb-agent-${v.id}`}>
              {agents.map((a) => <option key={a} value={a}>{a === "none" ? "no agent" : a}</option>)}
            </select></label>
          )}
          {cfg.allowAdd && <button type="button" className="btn btn--quiet" onClick={() => dispatch({ type: "remove", id: v.id })} aria-label={`Remove ${v.label}`}>Remove</button>}
        </fieldset>
      ))}
      <div className="precise__row">
        <label><input type="checkbox" checked={state.showComponents} onChange={() => dispatch({ type: "toggle-components" })} data-testid="vb-components-toggle" /> Show components</label>
        {cfg.allowAxesToggle && (
          <label><input type="checkbox" checked={state.axes === "tilted"} onChange={() => dispatch({ type: "set-axes", axes: state.axes === "tilted" ? "standard" : "tilted" })} data-testid="vb-axes-toggle" /> Tilted axes</label>
        )}
      </div>
      <p className="muted precise__help">Directions are in degrees, anticlockwise from the rightward direction: 90° is up, −90° is down.</p>
    </details>
  );
}
const round2 = (x: number) => Math.round(x * 100) / 100;
