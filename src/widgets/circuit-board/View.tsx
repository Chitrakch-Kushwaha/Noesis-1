"use client";
import { useId } from "react";
import { fmtNum } from "../shared";
import type { BaseAction } from "../types";
import { fmtValue, solved, type CBAction, type CBState, type CircuitElement } from "./model";

const W = 640, H = 340, PAD = 50;
type Dispatch = (a: CBAction | BaseAction) => void;

export function CircuitBoardView({ state, dispatch, t }: { state: CBState; dispatch: Dispatch; t: number }) {
  const id = useId();
  const nodes = state.config.nodes;
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min((W - 2 * PAD) / Math.max(1, x1 - x0), (H - 2 * PAD) / Math.max(1, y1 - y0));
  const ox = (W - k * (x1 - x0)) / 2, oy = (H - k * (y1 - y0)) / 2;
  const P = (nid: string) => { const n = nodes.find((m) => m.id === nid)!; return { x: ox + (n.x - x0) * k, y: oy + (n.y - y0) * k }; };
  const r = solved(state);
  const maxI = Math.max(1e-9, ...state.elements.map((e) => Math.abs(r.element.get(e.id)!.current)));
  const editable = state.elements.filter((e) => e.editable);
  return (
    <div className="cb">
      <svg viewBox={`0 0 ${W} ${H}`} className="widget-svg" role="group" aria-label="Circuit diagram" data-testid="cb-svg">
        {state.elements.map((e) => (
          <Part key={e.id} e={e} a={P(e.from)} b={P(e.to)} hl={state.overlay.highlight.includes(e.id)} label={label(e, state, r.element.get(e.id)!)}
            flow={state.overlay.currents ? r.element.get(e.id)!.current / maxI : 0} t={t} />
        ))}
        {state.overlay.voltages && nodes.map((n) => { const p = P(n.id); return <text key={n.id} className="v-label-good" x={p.x + 6} y={p.y - 6}>{fmtNum(r.V(n.id))} V</text>; })}
        {nodes.map((n) => { const p = P(n.id); return <circle key={n.id} cx={p.x} cy={p.y} r={3.5} fill="var(--text-primary)" />; })}
        {state.overlay.note && <text className="v-label-good" x={16} y={22}>{state.overlay.note}</text>}
      </svg>
      {editable.length > 0 && (
        <div className="te-controls" role="group" aria-label="Circuit controls">
          {editable.map((e) => e.kind === "switch" ? (
            <button key={e.id} type="button" className="btn btn--small" aria-pressed={e.closed} onClick={() => dispatch({ type: "toggle", id: e.id })} data-testid={`cb-switch-${e.id}`}>
              {e.label ?? e.id}: {e.closed ? "closed" : "open"}
            </button>
          ) : (
            <div key={e.id} className="answer-row">
              <label htmlFor={`${id}-${e.id}`} className="small">{e.label ?? e.id} ({e.kind === "battery" ? "V" : e.kind === "capacitor" ? "µF" : "Ω"})</label>
              <input id={`${id}-${e.id}`} type="number" step={e.kind === "capacitor" ? 1 : 0.5} min={0}
                value={e.kind === "capacitor" ? Number((e.value * 1e6).toPrecision(6)) : e.value}
                onChange={(ev) => ev.target.value !== "" && dispatch({ type: "set", id: e.id, value: Number(ev.target.value) * (e.kind === "capacitor" ? 1e-6 : 1) })}
                data-testid={`cb-value-${e.id}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function label(e: CircuitElement, s: CBState, x: { current: number; voltage: number }) {
  const name = e.label ?? (e.kind === "wire" ? "" : e.id);
  const val = fmtValue(e, s.config);
  if (e.kind === "wire") return "";
  if (!s.showValues) return [name, val].filter(Boolean).join(" ");
  if (e.kind === "ammeter") return `${name} ${fmtNum(Math.abs(x.current))} A`;
  if (e.kind === "voltmeter") return `${name} ${fmtNum(Math.abs(x.voltage))} V`;
  if (e.kind === "switch") return `${name} ${e.closed ? "closed" : "open"}`;
  if (e.kind === "capacitor") return `${name} ${val} · ${fmtNum(Math.abs(x.voltage))} V`;
  return `${name} ${val} · ${fmtNum(Math.abs(x.current))} A`;
}

function Part({ e, a, b, hl, label: text, flow, t }: { e: CircuitElement; a: { x: number; y: number }; b: { x: number; y: number }; hl: boolean; label: string; flow: number; t: number }) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const s = e.kind === "wire" ? 0 : 18; // half-length of the symbol
  const tone = hl ? "var(--accent-amber)" : "var(--border-strong)";
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const lead = (
    <>
      <line x1={a.x} y1={a.y} x2={mx - ux * s} y2={my - uy * s} stroke={tone} strokeWidth={2} />
      <line x1={mx + ux * s} y1={my + uy * s} x2={b.x} y2={b.y} stroke={tone} strokeWidth={2} />
    </>
  );
  const dots = Math.abs(flow) > 1e-6 && (
    <g aria-hidden="true">
      {Array.from({ length: Math.max(2, Math.round(L / 40)) }, (_, i) => {
        const f = (((i / Math.max(2, Math.round(L / 40)) +(flow > 0 ? 1 : -1) * t * 0.5 * Math.abs(flow)) % 1) + 1) % 1;
        return <circle key={i} cx={a.x + dx * f} cy={a.y + dy * f} r={3} fill="var(--accent-orange)" />;
      })}
    </g>
  );
  const sym = (() => {
    switch (e.kind) {
      case "battery": // long plate = positive terminal, nearer `to`
        return <g stroke={tone} strokeWidth={3}><line x1={mx - ux * 4 + nx * 8} y1={my - uy * 4 + ny * 8} x2={mx - ux * 4 - nx * 8} y2={my - uy * 4 - ny * 8} /><line x1={mx + ux * 4 + nx * 16} y1={my + uy * 4 + ny * 16} x2={mx + ux * 4 - nx * 16} y2={my + uy * 4 - ny * 16} /><line x1={mx - ux * s} y1={my - uy * s} x2={mx - ux * 4} y2={my - uy * 4} strokeWidth={2} /><line x1={mx + ux * 4} y1={my + uy * 4} x2={mx + ux * s} y2={my + uy * s} strokeWidth={2} /></g>;
      case "capacitor":
        return <g stroke={tone} strokeWidth={3}>{[-5, 5].map((o) => <line key={o} x1={mx + ux * o + nx * 14} y1={my + uy * o + ny * 14} x2={mx + ux * o - nx * 14} y2={my + uy * o - ny * 14} />)}<line x1={mx - ux * s} y1={my - uy * s} x2={mx - ux * 5} y2={my - uy * 5} strokeWidth={2} /><line x1={mx + ux * 5} y1={my + uy * 5} x2={mx + ux * s} y2={my + uy * s} strokeWidth={2} /></g>;
      case "resistor":
        return <rect x={mx - s} y={my - 7} width={2 * s} height={14} transform={`rotate(${ang} ${mx} ${my})`} fill="var(--surface-raised)" stroke={tone} strokeWidth={2} />;
      case "switch":
        return <g stroke={tone} strokeWidth={2}><circle cx={mx - ux * s} cy={my - uy * s} r={3} fill="var(--surface)" /><circle cx={mx + ux * s} cy={my + uy * s} r={3} fill="var(--surface)" />
          {e.closed ? <line x1={mx - ux * s} y1={my - uy * s} x2={mx + ux * s} y2={my + uy * s} /> : <line x1={mx - ux * s} y1={my - uy * s} x2={mx + ux * s * 0.8 + nx * 14} y2={my + uy * s * 0.8 + ny * 14} />}</g>;
      case "wire": return null;
      default: { // meters and lamp: a circle with a letter
        const letter = { ammeter: "A", voltmeter: "V", galvanometer: "G", lamp: "×" }[e.kind] ?? "";
        return <g><circle cx={mx} cy={my} r={s} fill="var(--surface-raised)" stroke={tone} strokeWidth={2} /><text className="v-text" x={mx} y={my + 5} textAnchor="middle">{letter}</text></g>;
      }
    }
  })();
  return (
    <g data-testid={`cb-el-${e.id}`}>
      {e.kind === "wire" ? <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={tone} strokeWidth={2} /> : lead}
      {sym}
      {dots}
      {text && <text className="v-text" x={mx + nx * 30} y={my + ny * 30 + 4} textAnchor="middle">{text}</text>}
    </g>
  );
}
