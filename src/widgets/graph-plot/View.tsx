"use client";
import { useCallback, useId, useMemo, useRef, type KeyboardEvent } from "react";
import { toLatex } from "@/src/checking/expr/latex";
import { fmtNum, Tex, useSvgDrag } from "../shared";
import type { BaseAction } from "../types";
import { areaOf, evalFn, extremaOf, fnOf, lineThrough, pointAt, progress, secantH, slopeAt, type AreaSpec, type GPAction, type GPState } from "./model";

type Dispatch = (a: GPAction | BaseAction) => void;
const W = 640, H = 400, PAD = 44;

export function GraphPlotView({ state, dispatch, t }: { state: GPState; dispatch: Dispatch; t: number }) {
  const cfg = state.config;
  const svgRef = useRef<SVGSVGElement>(null);
  const [x0, x1] = cfg.xRange, [y0, y1] = cfg.yRange;
  const X = useCallback((x: number) => PAD + ((x - x0) / (x1 - x0)) * (W - PAD - 16), [x0, x1]);
  const Y = useCallback((y: number) => H - PAD + 10 - ((y - y0) / (y1 - y0)) * (H - PAD - 24), [y0, y1]);
  const invX = (px: number) => x0 + ((px - PAD) / (W - PAD - 16)) * (x1 - x0);
  const invY = (py: number) => y0 + ((H - PAD + 10 - py) / (H - PAD - 24)) * (y1 - y0);

  const curves = useMemo(() => [...cfg.functions.filter((f) => f.tone !== "hidden"), ...state.extra.map((f) => ({ ...f, tone: f.tone === "bad" ? ("bad" as const) : ("good" as const) }))].map((f) => {
    const N = 320, segs: string[] = [];
    let cur = "", prevY: number | null = null;
    for (let i = 0; i <= N; i++) {
      const x = x0 + ((x1 - x0) * i) / N, y = evalFn(state, f.id, x);
      const ok = Number.isFinite(y) && y > y0 - (y1 - y0) * 3 && y < y1 + (y1 - y0) * 3;
      const jump = prevY !== null && Math.abs(y - prevY) > (y1 - y0) * 1.5;
      if (!ok || jump) { if (cur) segs.push(cur); cur = ""; prevY = ok ? y : null; if (!ok) continue; }
      cur += `${cur ? "L" : "M"} ${X(x).toFixed(2)} ${Y(y).toFixed(2)} `;
      prevY = y;
    }
    if (cur) segs.push(cur);
    return { id: f.id, tone: f.tone, label: f.label, d: segs.join(" ") };
  }), [state, cfg.functions, x0, x1, y0, y1, X, Y]);

  const ticks = (lo: number, hi: number) => {
    const span = hi - lo, raw = span / 8, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= 10)!;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  };
  const areas = [...cfg.areas, ...state.overlay.areas];
  const ln = lineThrough(state);
  const eq = cfg.equation ? fnOf(cfg, cfg.equation.fn) : null;

  return (
    <div className="gp">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Graph" data-testid="graph-plot">
        {ticks(x0, x1).map((v) => <g key={`x${v}`}><line className="v-grid" x1={X(v)} x2={X(v)} y1={Y(y1)} y2={Y(y0)} /><text className="v-text" x={X(v)} y={Y(y0) + 18} textAnchor="middle">{fmtNum(v)}</text></g>)}
        {ticks(y0, y1).map((v) => <g key={`y${v}`}><line className="v-grid" x1={X(x0)} x2={X(x1)} y1={Y(v)} y2={Y(v)} /><text className="v-text" x={X(x0) - 6} y={Y(v) + 4} textAnchor="end">{fmtNum(v)}</text></g>)}
        {y0 <= 0 && y1 >= 0 && <line className="v-axis" x1={X(x0)} x2={X(x1)} y1={Y(0)} y2={Y(0)} />}
        {x0 <= 0 && x1 >= 0 && <line className="v-axis" x1={X(0)} x2={X(0)} y1={Y(y0)} y2={Y(y1)} />}
        <text className="v-text" x={W - 18} y={Y(y0) + 34} textAnchor="end">{cfg.xLabel}</text>
        <text className="v-text" x={PAD} y={16}>{cfg.yLabel}</text>

        {areas.map((a) => <Area key={a.id} a={a} state={state} t={t} X={X} Y={Y} />)}
        {curves.map((c) => {
          const stroke = c.tone === "muted" ? "var(--border-strong)" : c.tone === "bad" ? "var(--accent-coral)" : c.tone === "good" ? "var(--success)" : state.overlay.highlight.includes(c.id) ? "var(--accent-amber)" : "var(--accent-orange)";
          return <path key={c.id} d={c.d} fill="none" stroke={stroke} strokeWidth={c.tone === "muted" ? 1.6 : 3} strokeDasharray={c.tone === "muted" || c.tone === "bad" ? "6 5" : undefined} data-testid={`gp-curve-${c.id}`} />;
        })}
        {ln && !ln.vertical && <line x1={X(x0)} x2={X(x1)} y1={Y(ln.slope * x0 + ln.intercept)} y2={Y(ln.slope * x1 + ln.intercept)} stroke="var(--accent-orange)" strokeWidth={2.5} data-testid="gp-line" />}
        {ln?.vertical && <line x1={X(ln.x)} x2={X(ln.x)} y1={Y(y0)} y2={Y(y1)} stroke="var(--accent-orange)" strokeWidth={2.5} data-testid="gp-line" />}
        <Tangents state={state} t={t} X={X} Y={Y} />
        {state.overlay.slopeTriangle && <SlopeTriangle st={state.overlay.slopeTriangle} state={state} X={X} Y={Y} />}
        {cfg.extrema && extremaOf(state, cfg.extrema.fn).map((e, i) => <g key={i} data-testid="gp-extremum"><circle cx={X(e.x)} cy={Y(e.y)} r={5} fill="none" stroke="var(--highlight-peach)" strokeWidth={2} /><text className="v-label-good" x={X(e.x)} y={Y(e.y) + (e.kind === "max" ? -12 : 22)} textAnchor="middle">local {e.kind}</text></g>)}
        {state.overlay.markers.map((m, i) => <g key={i}><circle cx={X(m.x)} cy={Y(m.y)} r={6} fill={m.tone === "bad" ? "var(--accent-coral)" : "var(--accent-amber)"} /><text className={m.tone === "bad" ? "v-label-bad" : "v-label-good"} x={X(m.x) + 10} y={Y(m.y) - 10}>{m.label}</text></g>)}
        {cfg.points.map((p) => <Handle key={p.id} id={p.id} state={state} t={t} X={X} Y={Y} invX={invX} invY={invY} svgRef={svgRef} dispatch={dispatch} />)}
      </svg>
      <div className="gp-readouts" aria-live="off">
        {eq && <p className="gp-eq" data-testid="gp-equation"><Tex tex={`y = ${toLatex(eq.ast, state.params)}`} /></p>}
        {ln && cfg.line?.showEquation && <p className="gp-eq" data-testid="gp-line-equation">{ln.vertical ? <Tex tex={`x = ${fmtNum(ln.x)}`} /> : <Tex tex={`y = ${fmtNum(ln.slope)}x ${ln.intercept < 0 ? "-" : "+"} ${fmtNum(Math.abs(ln.intercept))}`} />}</p>}
        {cfg.tangent && (() => { const spec = cfg.points.find((p) => p.id === cfg.tangent!.at)!; const q = pointAt(state, spec.id, t); return spec.on && cfg.tangent!.showSlope ? <p data-testid="gp-slope">Slope of the tangent at x = {fmtNum(q.x)}: <strong>{fmtNum(slopeAt(state, spec.on, q.x))}</strong></p> : null; })()}
        {areas.filter((a) => a.label && a.showValue !== false).map((a) => <p key={a.id} data-testid={`gp-area-${a.id}`}>{a.label}: <strong>{fmtNum(areaOf(state, a, sweepTo(state, a, t)))}</strong></p>)}
      </div>
      <Controls state={state} dispatch={dispatch} />
    </div>
  );
}

const sweepTo = (s: GPState, a: AreaSpec, t: number) => {
  if (s.anim?.kind !== "sweep-area" || s.anim.area.id !== a.id) return undefined;
  const from = typeof a.from === "number" ? a.from : s.points[a.from]?.x ?? Number(a.from);
  const to = typeof a.to === "number" ? a.to : s.points[a.to]?.x ?? Number(a.to);
  return from + (to - from) * progress(s, t);
};

function Area({ a, state, t, X, Y }: { a: AreaSpec; state: GPState; t: number; X: (x: number) => number; Y: (y: number) => number }) {
  const b = (v: number | string) => (typeof v === "number" ? v : state.points[v]?.x ?? Number(v));
  const lv = (v: number | string, x: number) => (typeof v === "number" ? v : evalFn(state, v, x));
  const lo = b(a.from), hi = sweepTo(state, a, t) ?? b(a.to);
  if (!(hi > lo)) return null;
  const n = 60, xs = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  const top = xs.map((x) => `${X(x)},${Y(lv(a.top, x))}`), bot = xs.reverse().map((x) => `${X(x)},${Y(lv(a.bottom, x))}`);
  const cls = a.tone === "bad" ? "v-bad" : a.tone === "neutral" ? "v-fill-amber" : "v-fill";
  return <polygon points={[...top, ...bot].join(" ")} className={cls} data-testid={`gp-region-${a.id}`} />;
}

function Tangents({ state, t, X, Y }: { state: GPState; t: number; X: (x: number) => number; Y: (y: number) => number }) {
  const cfg = state.config;
  const span = (cfg.xRange[1] - cfg.xRange[0]) * 0.3;
  const els: React.ReactNode[] = [];
  const tanIds = [cfg.tangent?.at, state.overlay.tangentAt].filter(Boolean) as string[];
  for (const id of new Set(tanIds)) {
    const spec = cfg.points.find((p) => p.id === id);
    if (!spec?.on) continue;
    const q = pointAt(state, id, t), m = slopeAt(state, spec.on, q.x);
    els.push(<line key={`t${id}`} x1={X(q.x - span)} y1={Y(q.y - m * span)} x2={X(q.x + span)} y2={Y(q.y + m * span)} stroke="var(--highlight-peach)" strokeWidth={2} data-testid="gp-tangent" />);
  }
  const h = secantH(state, t);
  if (h !== null && state.anim?.kind === "secant") {
    const { fn, x } = state.anim, ya = evalFn(state, fn, x), yb = evalFn(state, fn, x + h), m = (yb - ya) / h;
    els.push(<g key="sec" data-testid="gp-secant">
      <line x1={X(x - span)} y1={Y(ya - m * span)} x2={X(x + h + span)} y2={Y(yb + m * span)} stroke="var(--accent-amber)" strokeWidth={2} strokeDasharray="6 4" />
      <circle cx={X(x)} cy={Y(ya)} r={5} fill="var(--accent-amber)" /><circle cx={X(x + h)} cy={Y(yb)} r={5} fill="var(--accent-amber)" />
      <text className="v-label-good" x={X(x + h) + 8} y={Y(yb) - 8}>slope {fmtNum(m)}</text>
    </g>);
  }
  return <>{els}</>;
}

function SlopeTriangle({ st, state, X, Y }: { st: NonNullable<GPState["overlay"]["slopeTriangle"]>; state: GPState; X: (x: number) => number; Y: (y: number) => number }) {
  const ya = evalFn(state, st.fn, st.x1), yb = evalFn(state, st.fn, st.x2);
  const cls = st.tone === "bad" ? "v-label-bad" : "v-label-good", col = st.tone === "bad" ? "var(--accent-coral)" : "var(--accent-amber)";
  return <g data-testid="gp-slope-triangle">
    <path d={`M ${X(st.x1)} ${Y(ya)} H ${X(st.x2)} V ${Y(yb)}`} fill="none" stroke={col} strokeWidth={2} strokeDasharray="6 4" />
    <text className={cls} x={(X(st.x1) + X(st.x2)) / 2} y={Y(ya) + 18} textAnchor="middle">run {fmtNum(st.x2 - st.x1)}</text>
    <text className={cls} x={X(st.x2) + 8} y={(Y(ya) + Y(yb)) / 2}>rise {fmtNum(yb - ya)}</text>
  </g>;
}

function Handle({ id, state, t, X, Y, invX, invY, svgRef, dispatch }: {
  id: string; state: GPState; t: number; X: (x: number) => number; Y: (y: number) => number; invX: (p: number) => number; invY: (p: number) => number;
  svgRef: React.RefObject<SVGSVGElement | null>; dispatch: Dispatch;
}) {
  const spec = state.config.points.find((p) => p.id === id)!;
  const q = pointAt(state, id, t);
  const onMove = useCallback((p: { x: number; y: number }) => dispatch({ type: "move-point", id, x: invX(p.x), y: invY(p.y) }), [dispatch, id, invX, invY]);
  const drag = useSvgDrag(svgRef, onMove);
  const onKey = (e: KeyboardEvent<SVGElement>) => {
    const s = spec.step * (e.shiftKey ? 0.1 : 1) * (e.key.startsWith("Page") ? 10 : 1);
    const cur = state.points[id]!;
    const map: Record<string, [number, number]> = { ArrowRight: [s, 0], ArrowLeft: [-s, 0], ArrowUp: [0, s], ArrowDown: [0, -s], PageUp: [s, 0], PageDown: [-s, 0] };
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    if (spec.on && d[0] === 0) return;
    dispatch({ type: "move-point", id, x: cur.x + d[0], y: cur.y + d[1] });
  };
  return (
    <g>
      <circle cx={X(q.x)} cy={Y(q.y)} r={6} fill={state.overlay.highlight.includes(id) ? "var(--accent-coral)" : "var(--accent-amber)"} />
      <text className="v-strong" x={X(q.x) + 10} y={Y(q.y) - 10}>{spec.label}{spec.draggable ? ` (${fmtNum(q.x)}, ${fmtNum(q.y)})` : ""}</text>
      {spec.draggable && (
        <circle cx={X(q.x)} cy={Y(q.y)} r={20} className="vb-handle" tabIndex={0} role="slider"
          aria-label={`Point ${spec.label}. ${spec.on ? "Left and right arrows move it along the curve." : "Arrow keys move it."}`}
          aria-valuemin={spec.xRange?.[0] ?? state.config.xRange[0]} aria-valuemax={spec.xRange?.[1] ?? state.config.xRange[1]} aria-valuenow={q.x}
          aria-valuetext={`x ${fmtNum(q.x)}, y ${fmtNum(q.y)}`} onKeyDown={onKey} data-testid={`gp-handle-${id}`} {...drag} />
      )}
    </g>
  );
}

function Controls({ state, dispatch }: { state: GPState; dispatch: Dispatch }) {
  const cfg = state.config;
  const id = useId();
  const pts = cfg.points.filter((p) => p.draggable);
  const params = Object.entries(cfg.params);
  if (!pts.length && !params.length) return null;
  return (
    <details className="precise" open>
      <summary>Precise controls <span className="muted">(keyboard and form alternative to dragging)</span></summary>
      {params.map(([name, p]) => (
        <label key={name} className="precise__row" htmlFor={`${id}-${name}`}>
          {p.label ?? name}
          <input id={`${id}-${name}`} type="range" min={p.min} max={p.max} step={p.step} value={state.params[name]} onChange={(e) => dispatch({ type: "set-param", name, value: Number(e.target.value) })} data-testid={`gp-param-${name}`} />
          <output>{fmtNum(state.params[name]!)}</output>
        </label>
      ))}
      {pts.map((p) => (
        <fieldset key={p.id} className="precise__row">
          <legend>Point {p.label}</legend>
          <label>x <input type="number" step={p.step} value={round2(state.points[p.id]!.x)} onChange={(e) => e.target.value !== "" && dispatch({ type: "move-point", id: p.id, x: Number(e.target.value) })} data-testid={`gp-x-${p.id}`} /></label>
          {!p.on && <label>y <input type="number" step={p.step} value={round2(state.points[p.id]!.y)} onChange={(e) => e.target.value !== "" && dispatch({ type: "move-point", id: p.id, x: state.points[p.id]!.x, y: Number(e.target.value) })} data-testid={`gp-y-${p.id}`} /></label>}
        </fieldset>
      ))}
    </details>
  );
}
const round2 = (x: number) => Math.round(x * 1000) / 1000;
