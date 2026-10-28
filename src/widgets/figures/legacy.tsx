"use client";
// Explanatory figures carried over from Phase 1 (circuit, Venn diagram, box diagonal). They respond to the
// student's answer and to worked-solution steps, but students cannot manipulate them, so they never count
// as interactive models (interactive: false).
import { useEffect, useState } from "react";
import { fmtNum as fmt } from "../shared";

export type FigureCue =
  | { type: "idle" }
  | { type: "student"; value: unknown; tags: string[] }
  | { type: "solution"; step: number };

const has = (cue: FigureCue, tag: string) => cue.type === "student" && cue.tags.includes(tag);
const step = (cue: FigureCue) => (cue.type === "solution" ? cue.step : -1);

/** Flips to true one frame after `dep` changes, so CSS transitions can run from their start state. */
function useReveal(dep: unknown, reduced: boolean) {
  const [on, setOn] = useState(reduced);
  useEffect(() => {
    if (reduced) return setOn(true);
    setOn(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(id);
  }, [dep, reduced]);
  return on;
}

// ---------------- circuit with internal resistance ----------------
export function Circuit({ E, r, R, showVoltmeter, cue, reduced }: { E: number; r: number; R: number; showVoltmeter: boolean; cue: FigureCue; reduced: boolean }) {
  const I = E / (R + r);
  const s = step(cue);
  const on = useReveal(JSON.stringify(cue), reduced);
  const hotR_int = has(cue, "ignores-internal-resistance") || has(cue, "terminal-equals-emf") || s === 0 || (showVoltmeter && s === 1);
  const hotR_ext = has(cue, "only-internal-resistance") || has(cue, "drop-across-internal") || s === 0 || (showVoltmeter && s === 2);
  const done = cue.type === "solution" || cue.type === "student";
  const reading = cue.type === "student" && typeof cue.value === "number" ? cue.value : null;
  const ox = showVoltmeter ? 0 : 70;
  const loop = `M ${ox + 70} 70 H ${ox + 300} V 250 H ${ox + 70} Z`;
  const zig = (x: number, y: number, w: number) => `M ${x} ${y} l ${w * 0.1} -9 l ${w * 0.2} 18 l ${w * 0.2} -18 l ${w * 0.2} 18 l ${w * 0.2} -18 l ${w * 0.1} 9`;
  // potential ladder (voltmeter variant): 0 → +E (cell) → −Ir (inside) → −IR (resistor) → 0
  const L = { x: 360, y: 270, h: 200, w: 140 };
  const VY = (pot: number) => L.y - (pot / E) * L.h;
  return (
    <svg viewBox="0 0 520 320" role="img" aria-label="Circuit with a cell, its internal resistance and an external resistor">
      <path d={loop} fill="none" stroke="var(--border-strong)" strokeWidth={2.5} />
      <path d={loop} fill="none" stroke="var(--accent-amber)" strokeWidth={5} strokeLinecap="round" strokeDasharray="0 22" className="current-dots"
        style={{ animation: reduced ? "none" : `dots-flow ${Math.max(0.5, 1.6 / I)}s linear infinite` }} />
      {/* external resistor on top */}
      <rect x={ox + 140} y={56} width={90} height={28} fill="var(--background)" />
      <path d={zig(ox + 140, 70, 90)} fill="none" stroke={hotR_ext ? "var(--accent-orange)" : "var(--text-primary)"} strokeWidth={hotR_ext ? 3.5 : 2.5} />
      <text className="v-strong" x={ox + 185} y={44} textAnchor="middle">R = {R} Ω</text>
      {/* cell box on the left side */}
      <rect x={ox + 30} y={110} width={80} height={110} rx={10} fill="var(--background)" stroke="var(--highlight-peach)" strokeDasharray="5 4" />
      <text className="v-text" x={ox + 70} y={104} textAnchor="middle">cell</text>
      <line x1={ox + 50} x2={ox + 90} y1={135} y2={135} stroke="var(--text-primary)" strokeWidth={3} />
      <line x1={ox + 58} x2={ox + 82} y1={145} y2={145} stroke="var(--text-primary)" strokeWidth={5} />
      <text className="v-strong" x={ox + 120} y={146}>E = {E} V</text>
      <g transform={`translate(${ox + 70} 168) rotate(90)`}>
        <path d={zig(0, 0, 40)} fill="none" stroke={hotR_int ? "var(--accent-coral)" : "var(--text-primary)"} strokeWidth={hotR_int ? 3.5 : 2.5}
          style={{ opacity: hotR_int && !on ? 0.3 : 1, transition: reduced ? "none" : "opacity 500ms" }} />
      </g>
      <text className={hotR_int ? "v-label-bad" : "v-text"} x={ox + 120} y={196}>r = {fmt(r)} Ω{hotR_int && cue.type === "student" ? "  ← in the loop too" : ""}</text>
      {/* ammeter on the right */}
      <circle cx={ox + 300} cy={160} r={22} fill="var(--surface)" stroke="var(--text-primary)" strokeWidth={2} />
      <text className="v-strong" x={ox + 300} y={165} textAnchor="middle">A</text>
      <text className="v-text" x={ox + 330} y={156}>{done && !showVoltmeter && cue.type === "solution" ? `I = ${fmt(I)} A` : "I = ?"}</text>
      {reading !== null && !showVoltmeter && <text className="v-label-bad" x={ox + 330} y={176}>yours: {fmt(reading)} A</text>}
      {s === 0 && <text className="v-label-good" x={ox + 185} y={290} textAnchor="middle">r and R in series</text>}
      {showVoltmeter && (
        <>
          {/* voltmeter across the cell terminals */}
          <path d={`M ${ox + 70} 110 V 92 H 10 V 236 H ${ox + 70} V 220`} fill="none" stroke="var(--border-strong)" strokeDasharray="4 4" />
          <g transform="translate(10 164)">
            <circle r={16} fill="var(--surface)" stroke="var(--text-primary)" strokeWidth={2} />
            <text className="v-strong" y={5} textAnchor="middle">V</text>
          </g>
          <line x1={L.x} x2={L.x + L.w} y1={L.y} y2={L.y} className="v-axis" />
          <text className="v-text" x={L.x} y={L.y + 18}>potential around the loop</text>
          <path d={`M ${L.x} ${VY(0)} V ${VY(E)} H ${L.x + 35} L ${L.x + 60} ${VY(E - I * r)} H ${L.x + 80} L ${L.x + 120} ${VY(0)} H ${L.x + L.w}`} fill="none" stroke="var(--accent-orange)" strokeWidth={2.5} />
          <text className="v-text" x={L.x + 4} y={VY(E) - 8}>E</text>
          <path d={`M ${L.x + 48} ${VY(E)} V ${VY(E - I * r)}`} stroke={has(cue, "terminal-equals-emf") || s === 1 ? "var(--accent-coral)" : "transparent"} strokeWidth={4} />
          {(has(cue, "terminal-equals-emf") || s >= 1) && <text className="v-label-bad" x={L.x + 30} y={VY(E) - 26}>Ir lost inside</text>}
          <path d={`M ${L.x + 132} ${VY(E - I * r)} V ${VY(0)}`} stroke={has(cue, "drop-across-internal") || s >= 2 ? "var(--accent-amber)" : "transparent"} strokeWidth={4} />
          {(has(cue, "drop-across-internal") || s >= 2) && <text className="v-label-good" x={L.x + L.w} y={VY(E - I * r) - 8} textAnchor="end">V = {fmt(E - I * r)} V</text>}
          {reading !== null && <text className="v-label-bad" x={L.x + L.w} y={40} textAnchor="end">yours: {fmt(reading)} V</text>}
        </>
      )}
    </svg>
  );
}

// ---------------- Venn diagram ----------------
export function Venn({ A, B, U, op, cue, reduced }: { A: number[]; B: number[]; U: number[]; op: "difference" | "intersection" | "union"; cue: FigureCue; reduced: boolean }) {
  const s = step(cue);
  const on = useReveal(JSON.stringify(cue), reduced);
  const answer = op === "difference" ? A.filter((x) => !B.includes(x)) : op === "intersection" ? A.filter((x) => B.includes(x)) : [...new Set([...A, ...B])];
  const student = cue.type === "student" && Array.isArray(cue.value) ? (cue.value as number[]) : null;
  const ca = { x: 205, y: 165 }, cb = { x: 315, y: 165 }, R = 108;
  const groups = {
    aOnly: A.filter((x) => !B.includes(x)),
    both: A.filter((x) => B.includes(x)),
    bOnly: B.filter((x) => !A.includes(x)),
    out: U.filter((x) => !A.includes(x) && !B.includes(x)),
  };
  const placeIn = (xs: number[], cx: number, cy: number, cols: number) =>
    xs.map((x, i) => ({ x, px: cx + ((i % cols) - (cols - 1) / 2) * 34, py: cy + (Math.floor(i / cols) - (Math.ceil(xs.length / cols) - 1) / 2) * 34 }));
  const pts = [
    ...placeIn(groups.aOnly, 150, 165, 2),
    ...placeIn(groups.both, 260, 165, 1),
    ...placeIn(groups.bOnly, 370, 165, 2),
    ...groups.out.map((x, i) => ({ x, px: i % 2 === 0 ? 40 + (i / 2) * 34 : 480 - ((i - 1) / 2) * 34, py: i % 2 === 0 ? 290 : 40 })),
  ];
  const showAnswerRegion = s >= 1;
  return (
    <svg viewBox="0 0 520 320" role="img" aria-label="Venn diagram of sets A and B">
      <defs>
        <clipPath id="venn-a"><circle cx={ca.x} cy={ca.y} r={R} /></clipPath>
        <mask id="venn-a-minus-b"><rect width="520" height="320" fill="black" /><circle cx={ca.x} cy={ca.y} r={R} fill="white" /><circle cx={cb.x} cy={cb.y} r={R} fill="black" /></mask>
      </defs>
      <rect x={14} y={14} width={492} height={292} rx={14} fill="none" stroke="var(--border-strong)" />
      <text className="v-text" x={24} y={34}>U</text>
      {(s === 0 || (showAnswerRegion && op === "intersection")) && <circle cx={cb.x} cy={cb.y} r={R} clipPath="url(#venn-a)" className={s === 0 && op === "difference" ? "v-fill-amber" : "v-fill"} style={{ opacity: on ? 1 : 0, transition: reduced ? "none" : "opacity 500ms" }} />}
      {showAnswerRegion && op === "difference" && <rect width="520" height="320" mask="url(#venn-a-minus-b)" className="v-fill" style={{ opacity: on ? 1 : 0, transition: reduced ? "none" : "opacity 500ms" }} />}
      <circle cx={ca.x} cy={ca.y} r={R} fill="none" stroke="var(--accent-orange)" strokeWidth={2} />
      <circle cx={cb.x} cy={cb.y} r={R} fill="none" stroke="var(--accent-amber)" strokeWidth={2} />
      <text className="v-strong" x={ca.x - 70} y={ca.y - 80}>A</text>
      <text className="v-strong" x={cb.x + 62} y={cb.y - 80}>B</text>
      {pts.map(({ x, px, py }) => {
        const inStudent = student?.includes(x) ?? false;
        const correct = answer.includes(x);
        const fill = student ? (inStudent ? (correct ? "var(--accent-orange)" : "var(--accent-coral)") : "var(--surface)") : "var(--surface)";
        const missing = student && correct && !inStudent;
        return (
          <g key={x} transform={`translate(${px} ${py})`}>
            <circle r={14} fill={fill} stroke={missing ? "var(--accent-amber)" : "var(--border-strong)"} strokeDasharray={missing ? "4 3" : undefined} strokeWidth={missing ? 2 : 1} />
            <text className="v-strong" y={5} textAnchor="middle" style={{ fill: student && inStudent ? "var(--text-on-accent)" : undefined }}>{x}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------- box diagonal (3-D magnitude) ----------------
export function BoxDiagonal({ p, q, r, cue, reduced }: { p: number; q: number; r: number; cue: FigureCue; reduced: boolean }) {
  const s = step(cue);
  const on = useReveal(JSON.stringify(cue), reduced);
  const [P, Q, Rz] = [Math.abs(p), Math.abs(q), Math.abs(r)];
  // cabinet projection: x to the right, y receding at 30° (scaled 0.6), z up; never degenerate when sides are equal
  const u = Math.min(34, 220 / (P + 0.6 * Q * 0.87 + 1), 200 / (Rz + 0.6 * Q * 0.5 + 1));
  const pr = (x: number, y: number, z: number) => ({ x: 150 + x * u + y * u * 0.6 * 0.87, y: 270 - y * u * 0.6 * 0.5 - z * u });
  const o = pr(0, 0, 0), X = pr(P, 0, 0), Y = pr(0, Q, 0), XY = pr(P, Q, 0), Z = pr(0, 0, Rz), XZ = pr(P, 0, Rz), YZ = pr(0, Q, Rz), XYZ = pr(P, Q, Rz);
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }, stroke: string, w = 1.5, dash?: string) => <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={w} strokeDasharray={dash} />;
  const fade = { opacity: on ? 1 : 0, transition: reduced ? "none" : "opacity 500ms" };
  return (
    <svg viewBox="0 0 520 320" role="img" aria-label="Box with the vector as its diagonal">
      {[[X, XY], [Y, XY], [Z, XZ], [Z, YZ], [XZ, XYZ], [YZ, XYZ], [X, XZ], [Y, YZ], [XY, XYZ]].map(([a, b], i) => <g key={i}>{seg(a!, b!, "var(--border-subtle)")}</g>)}
      {seg(o, X, "var(--text-primary)", 2)}
      {seg(o, Y, "var(--text-primary)", 2)}
      {seg(o, Z, "var(--text-primary)", 2)}
      <text className="v-strong" x={(o.x + X.x) / 2 + 8} y={(o.y + X.y) / 2 + 18}>{P}</text>
      <text className="v-strong" x={(o.x + Y.x) / 2 - 18} y={(o.y + Y.y) / 2 + 18}>{Q}</text>
      <text className="v-strong" x={o.x - 18} y={(o.y + Z.y) / 2}>{Rz}</text>
      {(s >= 0 || has(cue, "missed-k-component")) && (
        <g style={fade}>
          {seg(o, XY, has(cue, "missed-k-component") ? "var(--accent-coral)" : "var(--accent-amber)", 3, has(cue, "missed-k-component") ? "6 5" : undefined)}
          <text className={has(cue, "missed-k-component") ? "v-label-bad" : "v-label-good"} x={XY.x + 8} y={XY.y + 18}>√{P * P + Q * Q} across the floor</text>
        </g>
      )}
      {(s >= 1) && <g style={fade}>{seg(o, XYZ, "var(--accent-orange)", 3.5)}<text className="v-label-good" x={XYZ.x + 8} y={XYZ.y - 6}>|a| = √{P * P + Q * Q + Rz * Rz}</text></g>}
      {s >= 1 && seg(XY, XYZ, "var(--accent-amber)", 2.5)}
      {has(cue, "added-components") && (
        <g style={fade}>
          <path d={`M ${o.x} ${o.y} L ${X.x} ${X.y} L ${XY.x} ${XY.y} L ${XYZ.x} ${XYZ.y}`} fill="none" stroke="var(--accent-coral)" strokeWidth={3} strokeDasharray="6 5" />
          <text className="v-label-bad" x={20} y={300}>{P} + {Q} + {Rz} walks along the edges</text>
          {seg(o, XYZ, "var(--accent-orange)", 3)}
        </g>
      )}
      {has(cue, "forgot-square-root") && <text className="v-label-bad" x={20} y={300}>{P * P + Q * Q + Rz * Rz} is |a|², the square of the length</text>}
    </svg>
  );
}
