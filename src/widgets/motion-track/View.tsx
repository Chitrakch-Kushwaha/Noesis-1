"use client";
import { useCallback, useId, useRef, type KeyboardEvent } from "react";
import { arrowHead, fmtNum, useSvgDrag } from "../shared";
import type { BaseAction } from "../types";
import { duration, laneAt, projectileAt, projectileFacts, type Lane, type MTAction, type MTState } from "./model";

type Dispatch = (a: MTAction | BaseAction) => void;
const W = 640;

export function MotionTrackView({ state, dispatch, t }: { state: MTState; dispatch: Dispatch; t: number }) {
  return state.config.mode === "2d" ? <Projectile state={state} dispatch={dispatch} t={t} /> : <Track1D state={state} dispatch={dispatch} t={t} />;
}

// ---------------------------------------------------------------- 1-D
function Track1D({ state, dispatch, t }: { state: MTState; dispatch: Dispatch; t: number }) {
  const cfg = state.config;
  const T = duration(state);
  const svgRef = useRef<SVGSVGElement>(null);
  const all = [...state.lanes, ...state.overlay.ghostLanes];
  const xs = all.flatMap((l) => [l.x0, laneAt(l, T, cfg.stopAtRest && !state.overlay.ghostLanes.includes(l)).x]).concat(state.overlay.flags.map((f) => f.x));
  const [xmin, xmax] = cfg.xRange ?? [Math.min(0, ...xs), Math.max(1, ...xs) * 1.08];
  const X = (x: number) => 40 + ((x - xmin) / (xmax - xmin || 1)) * (W - 80);
  const laneH = 56, top = 34;
  const H = top + Math.max(1, all.length) * laneH + 40;
  const unit = cfg.unit;
  return (
    <div className="mt">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Motion track" data-testid="motion-track">
        <text className="v-text" x={40} y={20}>t = {t.toFixed(2)} s of {fmtNum(T)} s</text>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const x = xmin + f * (xmax - xmin);
          return <g key={f}><line className="v-grid" x1={X(x)} x2={X(x)} y1={top - 6} y2={H - 30} />{state.revealed && <text className="v-text" x={X(x)} y={H - 12} textAnchor="middle">{fmtNum(x, 3)}</text>}</g>;
        })}
        <text className="v-text" x={W - 20} y={20} textAnchor="end">position ({unit})</text>
        {all.map((l, i) => {
          const ghost = state.overlay.ghostLanes.includes(l);
          const y = top + i * laneH + laneH / 2;
          const p = laneAt(l, t, cfg.stopAtRest && !ghost);
          const dots = Array.from({ length: 9 }, (_, k) => (k * T) / 8).filter((tk) => tk <= t + 1e-9);
          const hl = state.overlay.highlight === l.id;
          return (
            <g key={l.id} data-testid={`mt-lane-${l.id}`} opacity={ghost ? 0.85 : 1}>
              <line className="v-axis" x1={30} x2={W - 30} y1={y + 14} y2={y + 14} />
              <text className="v-text" x={34} y={y - 16}>{l.label}</text>
              {dots.map((tk, k) => <circle key={k} cx={X(laneAt(l, tk, cfg.stopAtRest && !ghost).x)} cy={y + 14} r={3.5} fill={ghost ? "var(--accent-coral)" : "var(--accent-amber)"} />)}
              <g transform={`translate(${X(p.x)} ${y})`} data-testid={ghost ? undefined : `mt-object-${l.id}`}>
                <rect x={-17} y={-9} width={34} height={18} rx={5} fill={ghost ? "none" : hl ? "var(--accent-amber)" : "var(--accent-orange)"} stroke={ghost ? "var(--accent-coral)" : "none"} strokeDasharray={ghost ? "5 4" : undefined} strokeWidth={2} />
              </g>
              {!ghost && <LaneHandles lane={l} y={y} X={X} xmin={xmin} xmax={xmax} svgRef={svgRef} state={state} dispatch={dispatch} />}
            </g>
          );
        })}
        {state.overlay.flags.map((f, i) => (
          <g key={i} data-testid="mt-flag">
            <line x1={X(f.x)} x2={X(f.x)} y1={top - 10} y2={H - 30} stroke={f.tone === "bad" ? "var(--accent-coral)" : "var(--accent-amber)"} strokeWidth={2} strokeDasharray={f.tone === "bad" ? "5 4" : undefined} />
            <text className={f.tone === "bad" ? "v-label-bad" : "v-label-good"} x={X(f.x)} y={top - 14 + (i % 2) * 12} textAnchor="middle">{f.label}</text>
          </g>
        ))}
      </svg>
      <div className="mt-graphs">
        <MiniGraph title={`position x (${unit})`} T={T} t={t} series={all.map((l) => ({ id: l.id, ghost: state.overlay.ghostLanes.includes(l), f: (tt: number) => laneAt(l, tt, cfg.stopAtRest && !state.overlay.ghostLanes.includes(l)).x }))}
          tangent={state.overlay.tangentAt !== null && state.lanes[0] ? { t: state.overlay.tangentAt, f: (tt) => laneAt(state.lanes[0]!, tt, cfg.stopAtRest).x } : null} testid="mt-graph-x" />
        <MiniGraph title={`velocity v (${unit}/s)`} T={T} t={t} series={all.map((l) => ({ id: l.id, ghost: state.overlay.ghostLanes.includes(l), f: (tt: number) => laneAt(l, tt, cfg.stopAtRest && !state.overlay.ghostLanes.includes(l)).v }))}
          area={state.overlay.areaTo !== null && state.lanes[0] ? { to: state.overlay.areaTo, f: (tt) => laneAt(state.lanes[0]!, tt, cfg.stopAtRest).v } : null} testid="mt-graph-v" />
      </div>
      <Controls1D state={state} dispatch={dispatch} />
    </div>
  );
}

function LaneHandles({ lane, y, X, xmin, xmax, svgRef, state, dispatch }: {
  lane: Lane; y: number; X: (x: number) => number; xmin: number; xmax: number; svgRef: React.RefObject<SVGSVGElement | null>; state: MTState; dispatch: Dispatch;
}) {
  const cfg = state.config;
  const pxPerUnit = (W - 80) / (xmax - xmin || 1);
  const vScale = 6; // px per (m/s)
  const fromPx = (px: number) => xmin + ((px - 40) / (W - 80)) * (xmax - xmin);
  const onX = useCallback((p: { x: number }) => dispatch({ type: "set-lane", lane: lane.id, key: "x0", value: fromPx(p.x) }), [dispatch, lane.id, xmin, xmax]); // eslint-disable-line react-hooks/exhaustive-deps
  const onV = useCallback((p: { x: number }) => dispatch({ type: "set-lane", lane: lane.id, key: "v0", value: (p.x - X(lane.x0)) / vScale }), [dispatch, lane.id, lane.x0]); // eslint-disable-line react-hooks/exhaustive-deps
  const dx = useSvgDrag(svgRef, onX);
  const dv = useSvgDrag(svgRef, onV);
  const key = (k: "x0" | "v0") => (e: KeyboardEvent<SVGElement>) => {
    const step = cfg.steps[k] * (e.shiftKey ? 0.2 : 1);
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : 0;
    if (!d) return;
    e.preventDefault();
    dispatch({ type: "set-lane", lane: lane.id, key: k, value: lane[k] + d });
  };
  const vx = X(lane.x0) + lane.v0 * vScale;
  void pxPerUnit;
  return (
    <g>
      {cfg.editable.includes("x0") && (
        <circle cx={X(lane.x0)} cy={y + 14} r={18} className="vb-handle" tabIndex={0} role="slider" aria-label={`${lane.label} starting position. Arrow keys move it.`}
          aria-valuemin={cfg.ranges.x0[0]} aria-valuemax={cfg.ranges.x0[1]} aria-valuenow={lane.x0} aria-valuetext={`${fmtNum(lane.x0)} ${cfg.unit}`} onKeyDown={key("x0")} data-testid={`mt-x0-${lane.id}`} {...dx} />
      )}
      {cfg.editable.includes("v0") && (
        <g>
          <line x1={X(lane.x0)} x2={vx} y1={y - 22} y2={y - 22} stroke="var(--highlight-peach)" strokeWidth={2.5} />
          {Math.abs(lane.v0) > 1e-9 && <polygon points={arrowHead(X(lane.x0), y - 22, vx, y - 22, 9)} fill="var(--highlight-peach)" />}
          <circle cx={vx} cy={y - 22} r={18} className="vb-handle" tabIndex={0} role="slider" aria-label={`${lane.label} starting velocity. Arrow keys change it.`}
            aria-valuemin={cfg.ranges.v0[0]} aria-valuemax={cfg.ranges.v0[1]} aria-valuenow={lane.v0} aria-valuetext={`${fmtNum(lane.v0)} ${cfg.unit} per second`} onKeyDown={key("v0")} data-testid={`mt-v0-${lane.id}`} {...dv} />
        </g>
      )}
    </g>
  );
}

function Controls1D({ state, dispatch }: { state: MTState; dispatch: Dispatch }) {
  const cfg = state.config;
  const id = useId();
  if (!cfg.editable.length) return null;
  return (
    <details className="precise" open>
      <summary>Precise controls <span className="muted">(keyboard and form alternative to dragging)</span></summary>
      {state.lanes.map((l) => (
        <fieldset key={l.id} className="precise__row">
          <legend>{l.label}</legend>
          {cfg.editable.map((k) => (
            <label key={k} htmlFor={`${id}-${l.id}-${k}`}>
              {k === "x0" ? "Start position" : k === "v0" ? "Start velocity" : "Acceleration"}
              <input id={`${id}-${l.id}-${k}`} type="range" min={cfg.ranges[k][0]} max={cfg.ranges[k][1]} step={cfg.steps[k]} value={l[k]}
                onChange={(e) => dispatch({ type: "set-lane", lane: l.id, key: k, value: Number(e.target.value) })} data-testid={`mt-range-${l.id}-${k}`}
                aria-valuetext={`${fmtNum(l[k])} ${k === "x0" ? cfg.unit : k === "v0" ? `${cfg.unit}/s` : `${cfg.unit}/s²`}`} />
              <output>{fmtNum(l[k])} {k === "x0" ? cfg.unit : k === "v0" ? `${cfg.unit}/s` : `${cfg.unit}/s²`}</output>
            </label>
          ))}
        </fieldset>
      ))}
    </details>
  );
}

// ---------------------------------------------------------------- 2-D
function Projectile({ state, dispatch, t }: { state: MTState; dispatch: Dispatch; t: number }) {
  const p0 = state.projectile!;
  const cfg = state.config;
  const svgRef = useRef<SVGSVGElement>(null);
  const facts = projectileFacts(p0);
  const H = 320;
  const xmax = Math.max(facts.range * 1.1, 10), ymax = Math.max(facts.apexHeight * 1.25, 5);
  const k = Math.min((W - 80) / xmax, (H - 70) / ymax);
  const X = (x: number) => 40 + x * k, Y = (y: number) => H - 40 - y * k;
  const now = projectileAt(p0, t);
  const path = Array.from({ length: 61 }, (_, i) => projectileAt(p0, (i / 60) * Math.min(t, facts.tLand))).map((q, i) => `${i ? "L" : "M"} ${X(q.x)} ${Y(q.y)}`).join(" ");
  const full = Array.from({ length: 61 }, (_, i) => projectileAt(p0, (i / 60) * facts.tLand)).map((q, i) => `${i ? "L" : "M"} ${X(q.x)} ${Y(q.y)}`).join(" ");
  const a = (p0.angleDeg * Math.PI) / 180, vk = 3;
  const tip = { x: X(p0.x0) + p0.speed * vk * Math.cos(a), y: Y(p0.y0) - p0.speed * vk * Math.sin(a) };
  const onMove = useCallback((p: { x: number; y: number }) => {
    const dx = (p.x - X(p0.x0)) / vk, dy = (Y(p0.y0) - p.y) / vk;
    if (cfg.editable2d.includes("speed")) dispatch({ type: "set-projectile", key: "speed", value: Math.round(Math.hypot(dx, dy) * 2) / 2 });
    if (cfg.editable2d.includes("angleDeg")) dispatch({ type: "set-projectile", key: "angleDeg", value: Math.round((Math.atan2(dy, dx) * 180) / Math.PI) });
  }, [dispatch, p0.x0, p0.y0, k]); // eslint-disable-line react-hooks/exhaustive-deps
  const drag = useSvgDrag(svgRef, onMove);
  const onKey = (e: KeyboardEvent<SVGElement>) => {
    const f = e.shiftKey ? 0.2 : 1;
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && cfg.editable2d.includes("angleDeg")) { e.preventDefault(); dispatch({ type: "set-projectile", key: "angleDeg", value: p0.angleDeg + (e.key === "ArrowLeft" ? 1 : -1) * 5 * f }); }
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && cfg.editable2d.includes("speed")) { e.preventDefault(); dispatch({ type: "set-projectile", key: "speed", value: p0.speed + (e.key === "ArrowUp" ? 1 : -1) * f }); }
  };
  const editable = cfg.editable2d.length > 0;
  const T = facts.tLand;
  return (
    <div className="mt">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Projectile motion" data-testid="motion-track">
        <line className="v-axis" x1={20} x2={W - 20} y1={Y(0)} y2={Y(0)} />
        <path d={full} fill="none" stroke="var(--border-strong)" strokeDasharray="3 6" />
        <path d={path} fill="none" stroke="var(--accent-orange)" strokeWidth={2.5} />
        {state.overlay.flags.map((f, i) => (
          <g key={i} data-testid="mt-flag">
            <line x1={X(f.x)} x2={X(f.x)} y1={Y(0) - 70} y2={Y(0)} stroke={f.tone === "bad" ? "var(--accent-coral)" : "var(--accent-amber)"} strokeWidth={2} strokeDasharray={f.tone === "bad" ? "5 4" : undefined} />
            <text className={f.tone === "bad" ? "v-label-bad" : "v-label-good"} x={X(f.x)} y={Y(0) - 76} textAnchor="middle">{f.label}</text>
          </g>
        ))}
        <circle cx={X(now.x)} cy={Y(now.y)} r={8} fill="var(--accent-amber)" data-testid="mt-ball" />
        {!now.landed && <g><line x1={X(now.x)} y1={Y(now.y)} x2={X(now.x) + now.vx * vk} y2={Y(now.y) - now.vy * vk} stroke="var(--highlight-peach)" strokeWidth={2} /><polygon points={arrowHead(X(now.x), Y(now.y), X(now.x) + now.vx * vk, Y(now.y) - now.vy * vk, 8)} fill="var(--highlight-peach)" /></g>}
        <line x1={X(p0.x0)} y1={Y(p0.y0)} x2={tip.x} y2={tip.y} stroke="var(--text-primary)" strokeWidth={2.5} />
        <polygon points={arrowHead(X(p0.x0), Y(p0.y0), tip.x, tip.y)} fill="var(--text-primary)" />
        {editable && <circle cx={tip.x} cy={tip.y} r={20} className="vb-handle" tabIndex={0} role="slider" aria-label="Launch arrow. Left and right change the angle, up and down change the speed."
          aria-valuenow={p0.speed} aria-valuemin={cfg.ranges2d.speed[0]} aria-valuemax={cfg.ranges2d.speed[1]} aria-valuetext={`${fmtNum(p0.speed)} m/s at ${fmtNum(p0.angleDeg)} degrees`} onKeyDown={onKey} data-testid="mt-launch" {...drag} />}
        <text className="v-text" x={40} y={22}>t = {t.toFixed(2)} s{state.revealed ? ` · x = ${fmtNum(now.x)} m · y = ${fmtNum(now.y)} m` : ""}</text>
        {state.revealed && <text className="v-text" x={W - 30} y={22} textAnchor="end">range {fmtNum(facts.range)} m · max height {fmtNum(facts.apexHeight)} m</text>}
      </svg>
      <div className="mt-graphs">
        <MiniGraph title="x and y (m)" T={T} t={t} series={[{ id: "x", f: (tt) => projectileAt(p0, tt).x }, { id: "y", f: (tt) => projectileAt(p0, tt).y, ghost: true }]} testid="mt-graph-x" />
        <MiniGraph title="vx and vy (m/s)" T={T} t={t} series={[{ id: "vx", f: (tt) => projectileAt(p0, tt).vx }, { id: "vy", f: (tt) => projectileAt(p0, Math.min(tt, T)).vy, ghost: true }]} testid="mt-graph-v" />
      </div>
      {editable && (
        <details className="precise" open>
          <summary>Precise controls <span className="muted">(keyboard and form alternative to dragging)</span></summary>
          <fieldset className="precise__row"><legend>Launch</legend>
            {cfg.editable2d.map((key) => (
              <label key={key}>{key === "speed" ? "Speed" : key === "angleDeg" ? "Angle" : "Height"}
                <input type="range" min={cfg.ranges2d[key][0]} max={cfg.ranges2d[key][1]} step={key === "angleDeg" ? 1 : 0.5} value={p0[key]}
                  onChange={(e) => dispatch({ type: "set-projectile", key, value: Number(e.target.value) })} data-testid={`mt-range-${key}`} />
                <output>{fmtNum(p0[key])} {key === "angleDeg" ? "°" : key === "speed" ? "m/s" : "m"}</output>
              </label>
            ))}
          </fieldset>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- graphs linked to the same clock
export function MiniGraph({ title, T, t, series, tangent = null, area = null, testid }: {
  title: string; T: number; t: number; series: { id: string; f: (t: number) => number; ghost?: boolean }[];
  tangent?: { t: number; f: (t: number) => number } | null; area?: { to: number; f: (t: number) => number } | null; testid?: string;
}) {
  const w = 300, h = 150, pad = 30;
  const N = 80;
  const samples = series.map((s) => Array.from({ length: N + 1 }, (_, i) => s.f((i / N) * T)));
  const flat = samples.flat().filter(Number.isFinite);
  let lo = Math.min(0, ...flat), hi = Math.max(0, ...flat);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const X = (tt: number) => pad + (tt / (T || 1)) * (w - pad - 8), Y = (v: number) => h - 22 - ((v - lo) / (hi - lo)) * (h - 40);
  const pathOf = (vals: number[], upTo = T) => vals.map((v, i) => [(i / N) * T, v] as const).filter(([tt]) => tt <= upTo + 1e-9).map(([tt, v], i) => `${i ? "L" : "M"} ${X(tt)} ${Y(v)}`).join(" ");
  let tan: string | null = null;
  if (tangent) {
    const d = 1e-4 * Math.max(1, T), s = (tangent.f(tangent.t + d) - tangent.f(tangent.t - d)) / (2 * d), y0 = tangent.f(tangent.t), half = T * 0.25;
    tan = `M ${X(tangent.t - half)} ${Y(y0 - s * half)} L ${X(tangent.t + half)} ${Y(y0 + s * half)}`;
  }
  let areaPath: string | null = null;
  if (area) {
    const pts = Array.from({ length: 41 }, (_, i) => (i / 40) * Math.min(area.to, T));
    areaPath = `M ${X(0)} ${Y(0)} ` + pts.map((tt) => `L ${X(tt)} ${Y(area.f(tt))}`).join(" ") + ` L ${X(pts[pts.length - 1]!)} ${Y(0)} Z`;
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mini-graph" role="img" aria-label={`${title} against time`} data-testid={testid}>
      <text className="v-text" x={pad} y={14}>{title}</text>
      <line className="v-axis" x1={pad} x2={w - 6} y1={Y(0)} y2={Y(0)} />
      <line className="v-axis" x1={pad} x2={pad} y1={20} y2={h - 20} />
      {areaPath && <path d={areaPath} className="v-fill" data-testid="mt-area" />}
      {samples.map((vals, i) => (
        <g key={series[i]!.id}>
          <path d={pathOf(vals)} fill="none" stroke={series[i]!.ghost ? "var(--accent-coral)" : "var(--border-strong)"} strokeDasharray={series[i]!.ghost ? "4 4" : "2 4"} strokeWidth={1.5} />
          <path d={pathOf(vals, t)} fill="none" stroke={series[i]!.ghost ? "var(--accent-coral)" : "var(--accent-orange)"} strokeWidth={2.5} />
        </g>
      ))}
      {tan && <path d={tan} stroke="var(--highlight-peach)" strokeWidth={2} data-testid="mt-tangent" />}
      <line x1={X(t)} x2={X(t)} y1={20} y2={h - 20} stroke="var(--accent-amber)" strokeWidth={1.5} />
      <text className="v-text" x={w - 6} y={h - 6} textAnchor="end">t (s)</text>
    </svg>
  );
}
