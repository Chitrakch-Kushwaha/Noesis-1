// Turn a template + seed into a concrete, JSON-serialisable question instance (deterministic per seed).
import { check } from "@/src/checking/check";
import { compile } from "@/src/checking/expr/evaluate";
import { parseExpression } from "@/src/checking/expr/parse";
import type { CheckInput, CheckSpec, DiagramForce, DiagramRules, Interval, SetElement } from "@/src/checking/types";
import { NAMED_DIMENSIONS, type DimensionName } from "@/src/checking/units";
import { rng } from "./rng";
import { formatUnion } from "@/src/widgets/number-line/model";
import { constraintHolds, fillDeep, type Ctx } from "./placeholders";
import type { CueRef, Template } from "./schema";
import { SOLVERS } from "./solvers";

export type Cues = CueRef[];
export interface Step { text: string; cues: Cues }

export interface QuestionInstance {
  templateId: string;
  version: number;
  status: Template["status"];
  chapterId: string;
  skillId: string;
  skillIds: string[];
  difficulty: Template["difficulty"];
  format: Template["format"];
  seed: number;
  params: Record<string, number | string>;
  intro: string;
  stem: string[];
  answerText: string;
  input?: { label: string; placeholder: string; keypad: "none" | "maths" | "interval" | "set" };
  options?: { id: string; text: string; cues: Cues }[];
  items?: { id: string; text: string }[];
  targets?: { id: string; text: string }[];
  widget: { type: string; config: Record<string, unknown>; instructions: string };
  check: CheckSpec;
  consequence: Cues;
  resolution: Cues;
  hints: Step[];
  feedback: Record<string, Step>;
  solution: Step[];
  alternative?: { title: string; steps: Step[] };
  flashcards: Record<string, { front: string; back: string }>;
  reasoning?: { prompt: string; rubric: string[]; modelAnswer: string };
  accessibility: { altText: string; nonDragAlternative?: string };
  /** validation data only — never shown to students */
  selfTest: { correct: CheckInput[]; buggy: { input: CheckInput; tags: string[] }[] };
}

export class InstantiateError extends Error {}

const asCues = (c: CueRef | CueRef[] | undefined): Cues => (c ? (Array.isArray(c) ? c : [c]) : []);
const step = (s: { text: string; cue?: CueRef | CueRef[] }): Step => ({ text: s.text, cues: asCues(s.cue) });

export const SI_SYMBOL: Record<DimensionName, string> = {
  dimensionless: "", length: "m", mass: "kg", time: "s", current: "A", temperature: "K", amount: "mol", area: "m^2", volume: "m^3",
  velocity: "m/s", acceleration: "m/s^2", force: "N", momentum: "kg m/s", energy: "J", power: "W", pressure: "Pa", frequency: "Hz",
  density: "kg/m^3", charge: "C", voltage: "V", resistance: "Ω", capacitance: "F", "magnetic-field": "T", "magnetic-flux": "Wb",
  inductance: "H", "electric-field": "N/C", torque: "N m", "angular-velocity": "rad/s", "spring-constant": "N/m",
  "moment-of-inertia": "kg m^2", "angular-momentum": "kg m^2/s", "angular-acceleration": "rad/s^2", "dipole-moment": "C m",
  "electric-flux": "N m^2/C", "magnetic-moment": "A m^2", resistivity: "Ω m", "optical-power": "D",
  "surface-charge-density": "C/m^2", "linear-charge-density": "C/m",
};

/** One random draw of a template's parameters (no constraints applied). */
export function sampleParams(t: Template, r: ReturnType<typeof rng>): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [name, p] of Object.entries(t.parameters)) {
    if (p.kind === "int") out[name] = r.int(p.min, p.max);
    else if (p.kind === "decimal") { const n = Math.round((p.max - p.min) / p.step); out[name] = +(p.min + r.int(0, n) * p.step).toFixed(10); }
    else if (p.kind === "choice") out[name] = r.pick(p.values);
    else out[name] = p.value;
  }
  return out;
}

/** Render an answer value as the input a student could type or give. */
export function renderInput(format: Template["format"], value: unknown, spec: CheckSpec): CheckInput {
  switch (format) {
    case "quantity": {
      if (typeof value === "string") return value;
      const s = spec as Extract<CheckSpec, { kind: "quantity" }>;
      return `${Number((value as number).toPrecision(12))} ${SI_SYMBOL[s.dimension]}`.trim();
    }
    case "number": return typeof value === "string" ? value : String(Number((value as number).toPrecision(12)));
    case "interval": return formatUnion(value as Interval[]);
    case "set": return `{${(value as SetElement[]).map((e) => (Array.isArray(e) ? `(${e[0]}, ${e[1]})` : String(e))).join(", ")}}`;
    default: return value as CheckInput;
  }
}

function buildSpec(t: Template, ans: Record<string, unknown>, content: { options?: { id: string; tags?: string[] }[]; items?: { id: string }[]; targets?: { id: string }[] }): CheckSpec {
  const a = { ...t.answer, ...ans };
  switch (t.format) {
    case "quantity":
      if (!(String(a.dimension) in NAMED_DIMENSIONS)) throw new InstantiateError(`Unknown dimension ${String(a.dimension)}`);
      return { kind: "quantity", value: a.value as number, dimension: a.dimension as DimensionName, tolerance: (a.tolerance as { relative?: number; absolute?: number }) ?? { relative: 0.01 }, temperature: a.temperature as "absolute" | "difference" | undefined, requireUnit: a.requireUnit as boolean | undefined };
    case "number": return { kind: "number", value: a.value as number, exact: a.exact as boolean | undefined, tolerance: a.tolerance as { relative?: number; absolute?: number } | undefined, allowedFunctions: a.allowedFunctions as string[] | undefined };
    case "expression": return { kind: "expression", reference: a.reference as string, variables: a.variables as string[], domain: a.domain as Record<string, [number, number]>, forms: a.forms as never, allowedFunctions: a.allowedFunctions as string[] | undefined, logBase: a.logBase as "e" | "10" | undefined, specialPoints: a.specialPoints as never, domainMustMatch: a.domainMustMatch as boolean | undefined };
    case "antiderivative": return { kind: "antiderivative", integrand: a.integrand as string, reference: a.reference as string | undefined, variable: a.variable as string, domain: a.domain as Record<string, [number, number]>, requireConstant: a.requireConstant as boolean | undefined, constants: a.constants as string[] | undefined };
    case "equation": return { kind: "equation", reference: a.reference as string, variables: a.variables as string[], box: a.box as Record<string, [number, number]> };
    case "interval": return { kind: "interval", union: a.union as Interval[] };
    case "set": return { kind: "set", elements: a.elements as SetElement[] };
    case "single-choice": return { kind: "single-choice", correct: a.correct as string, options: (content.options ?? []).map((o) => ({ id: o.id, tags: o.tags })) };
    case "multi-choice": return { kind: "multi-choice", correct: a.correct as string[], options: (content.options ?? []).map((o) => ({ id: o.id, tags: o.tags })) };
    case "ordering": return { kind: "ordering", items: (content.items ?? []).map((i) => i.id), correct: a.correct as string[], ties: a.ties as string[][] | undefined };
    case "mapping": return { kind: "mapping", items: (content.items ?? []).map((i) => i.id), targets: (content.targets ?? []).map((i) => i.id), accepted: a.accepted as Record<string, string[]>, rules: a.rules as never };
    case "diagram": return { kind: "diagram", rules: a.rules as DiagramRules };
  }
}

const textValue = (s: string) => { try { return compile(parseExpression(s).ast)({}); } catch { return NaN; } };
function attachBuggy(spec: CheckSpec, buggy: { value: unknown; tags: string[] }[]): CheckSpec {
  switch (spec.kind) {
    case "quantity": case "number": return { ...spec, buggy: buggy.map((b) => ({ value: typeof b.value === "number" ? b.value : textValue(String(b.value)), tags: b.tags })).filter((b) => Number.isFinite(b.value)) };
    case "expression": case "antiderivative": return { ...spec, buggy: buggy.map((b) => ({ expression: String(b.value), tags: b.tags })) };
    case "equation": return { ...spec, buggy: buggy.map((b) => ({ equation: String(b.value), tags: b.tags })) };
    case "set": return { ...spec, buggy: buggy.map((b) => ({ elements: b.value as SetElement[], tags: b.tags })) };
    case "ordering": return { ...spec, buggy: buggy.map((b) => ({ order: b.value as string[], tags: b.tags })) };
    default: return spec;
  }
}

function correctInputs(t: Template, spec: CheckSpec, ans: Record<string, unknown>, examples: string[]): CheckInput[] {
  const out: CheckInput[] = [];
  switch (spec.kind) {
    case "quantity": case "number": if (!(spec.kind === "number" && spec.exact)) out.push(renderInput(t.format, spec.value, spec)); break;
    case "expression": out.push(spec.reference); break;
    case "antiderivative": if (spec.reference) out.push(`${spec.reference} + ${(spec.constants ?? ["C"])[0]}`); break;
    case "equation": out.push(spec.reference); break;
    case "interval": out.push(renderInput("interval", spec.union, spec)); break;
    case "set": out.push(renderInput("set", spec.elements, spec)); break;
    case "single-choice": out.push(spec.correct); break;
    case "multi-choice": out.push([...spec.correct].reverse()); break;
    case "ordering": out.push(spec.correct); break;
    case "mapping": out.push(Object.fromEntries(spec.items.map((i) => [i, spec.accepted[i]![0]!]))); break;
    case "diagram": out.push(spec.rules.required.map((r) => ({ kind: r.kind, agent: r.agent ?? "unknown", magnitude: r.magnitude ?? 10, angleDeg: r.angleDeg ?? 0 }))); break;
  }
  void ans;
  return [...out, ...examples];
}

function buggyInputs(spec: CheckSpec, buggy: { value: unknown; tags: string[]; input: CheckInput }[]): { input: CheckInput; tags: string[] }[] {
  const out = buggy.map((b) => ({ input: b.input, tags: b.tags }));
  if (spec.kind === "single-choice") for (const o of spec.options) if (o.tags?.length && o.id !== spec.correct) out.push({ input: o.id, tags: o.tags });
  if (spec.kind === "multi-choice") for (const o of spec.options) if (o.tags?.length && !spec.correct.includes(o.id)) out.push({ input: [...spec.correct, o.id], tags: o.tags });
  if (spec.kind === "mapping") for (const r of spec.rules ?? []) out.push({ input: Object.fromEntries(spec.items.map((i) => [i, i === r.item ? r.target : spec.accepted[i]![0]!])), tags: r.tags });
  if (spec.kind === "interval") {
    // flipping one finite endpoint between included and excluded must be caught as an endpoint mistake
    spec.union.forEach((piece, i) => (["lo", "hi"] as const).forEach((end) => {
      if (!Number.isFinite(piece[end])) return;
      const flipped = spec.union.map((p, j) => (j === i ? { ...p, [end === "lo" ? "loClosed" : "hiClosed"]: !p[end === "lo" ? "loClosed" : "hiClosed"] } : p));
      out.push({ input: formatUnion(flipped), tags: ["open-closed-confusion"] });
    }));
  }
  if (spec.kind === "diagram") {
    const full: DiagramForce[] = spec.rules.required.map((r) => ({ kind: r.kind, agent: r.agent ?? "unknown", magnitude: r.magnitude ?? 10, angleDeg: r.angleDeg ?? 0 }));
    spec.rules.required.forEach((r, i) => out.push({ input: full.filter((_, j) => j !== i), tags: r.missingTags }));
    for (const f of spec.rules.forbidden ?? []) out.push({ input: [...full, { kind: f.kind, agent: "hand", magnitude: 5, angleDeg: 0 }], tags: f.tags });
  }
  return out;
}

export function instantiate(t: Template, seed: number): QuestionInstance {
  const solver = SOLVERS[t.solver];
  if (!solver) throw new InstantiateError(`Solver ${t.solver} is not registered`);
  const r = rng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const params = sampleParams(t, r);
    if (!t.constraints.every((c) => constraintHolds(c, params))) continue;
    let solved: ReturnType<typeof solver.solve>;
    try { solved = solver.solve(params); } catch (e) { if ((e as Error).message === "reject") continue; throw e; }
    const ctx: Ctx = { ...params, ...(solved.derived ?? {}) };
    const variant = t.variants ? t.variants.cases[String(params[t.variants.param])] ?? {} : {};
    const c = fillDeep({
      intro: variant.intro ?? t.intro, stem: variant.stem ?? t.stem, answerText: variant.answerText ?? t.answerText,
      hints: variant.hints ?? t.hints, feedback: { ...t.feedback, ...(variant.feedback ?? {}) }, workedSolution: variant.workedSolution ?? t.workedSolution,
      alternativeSolution: variant.alternativeSolution ?? t.alternativeSolution, flashcards: { ...t.flashcards, ...(variant.flashcards ?? {}) },
      options: variant.options ?? t.options, items: variant.items ?? t.items, targets: variant.targets ?? t.targets, input: variant.input ?? t.input,
      accessibility: variant.accessibility ?? t.accessibility, widget: t.widget, consequence: t.consequence, resolution: t.resolution, reasoning: t.reasoning,
      answer: t.answer, acceptExamples: t.acceptExamples,
    }, ctx);
    const base = buildSpec({ ...t, answer: c.answer as Record<string, unknown> }, solved.answer, c);
    // wrong-method values: dropped when they coincide with the correct answer for these parameters
    const buggy: { value: unknown; tags: string[]; input: CheckInput }[] = [];
    for (const rule of t.misconceptionRules) {
      const f = solver.buggy?.[rule.match.buggySolver];
      if (!f) throw new InstantiateError(`Buggy solver ${rule.match.buggySolver} is not registered on ${t.solver}`);
      const value = f(params);
      if (value === null || value === undefined) continue;
      const input = renderInput(t.format, value, base);
      if (check(base, input).status === "correct") continue;
      if (buggy.some((b) => JSON.stringify(b.input) === JSON.stringify(input))) { buggy.find((b) => JSON.stringify(b.input) === JSON.stringify(input))!.tags.push(...rule.tags); continue; }
      buggy.push({ value, tags: [...rule.tags], input });
    }
    const spec = attachBuggy(base, buggy);
    return {
      templateId: t.id, version: t.version, status: t.status, chapterId: t.chapterId, skillId: t.primarySkillId, skillIds: t.skillIds,
      difficulty: t.difficulty, format: t.format, seed, params,
      intro: c.intro, stem: c.stem, answerText: c.answerText, input: c.input,
      options: c.options?.map((o) => ({ id: o.id, text: o.text, cues: asCues(o.cue) })), items: c.items, targets: c.targets,
      widget: c.widget, check: spec, consequence: asCues(c.consequence), resolution: asCues(c.resolution),
      hints: c.hints.map(step), feedback: Object.fromEntries(Object.entries(c.feedback).map(([k, v]) => [k, step(v)])),
      solution: c.workedSolution.map(step),
      alternative: c.alternativeSolution ? { title: c.alternativeSolution.title, steps: c.alternativeSolution.steps.map(step) } : undefined,
      flashcards: c.flashcards, reasoning: c.reasoning, accessibility: c.accessibility,
      selfTest: { correct: correctInputs(t, spec, solved.answer, c.acceptExamples), buggy: buggyInputs(spec, buggy) },
    };
  }
  throw new InstantiateError(`${t.id}: constraints could not be satisfied in 200 tries (seed ${seed})`);
}
