// Content validation (docs/05 §6). Pure, so the CLI, the review tool and unit tests share it.
// It never changes a template's status: approval is a separate, human-only step (content:review).
import { check } from "@/src/checking/check";
import type { CheckInput, CheckResult } from "@/src/checking/types";
import { WIDGETS } from "@/src/widgets/registry";
import { dimsOf, parseQuantity, sameDims } from "@/src/checking/units";
import { instantiate, sampleParams, type Cues, type QuestionInstance } from "./instantiate";
import { constraintHolds, formatValue, hasPlaceholder } from "./placeholders";
import { rng } from "./rng";
import { resolveCues } from "./runtime";
import { TemplateSchema, type Template } from "./schema";
import { SOLVERS } from "./solvers";

export interface Issue { level: "error" | "warning"; templateId: string; where: string; message: string }

/** Seeds every template is instantiated with. The review tool shows the same set. */
export const VALIDATION_SEEDS = Array.from({ length: 50 }, (_, i) => 1 + i * 7919);
export const REVIEW_SEED_COUNT = 8;

const BASE_CUES = new Set(["clear-overlay", "reset"]);
/** Formats where the student builds the answer by direct manipulation. */
const DRAG_FORMATS = new Set(["ordering", "mapping", "diagram", "interval"]);
/** Development language that must never reach a learner. */
export const DEV_LANGUAGE = /\b(phase \d|phase one|phase two|later phase|awaiting|content review|in-review|todo|tbd|fixme|lorem|placeholder text|not yet reviewed)\b/i;

function studentText(q: QuestionInstance): string[] {
  const steps = (s: { text: string }[]) => s.map((x) => x.text);
  return [
    q.intro, ...q.stem, q.answerText, q.widget.instructions, q.accessibility.altText, q.accessibility.nonDragAlternative ?? "",
    q.input?.label ?? "", q.input?.placeholder ?? "",
    ...(q.options ?? []).map((o) => o.text), ...(q.items ?? []).map((o) => o.text), ...(q.targets ?? []).map((o) => o.text),
    ...steps(q.hints), ...steps(Object.values(q.feedback)), ...steps(q.solution), ...(q.alternative ? [q.alternative.title, ...steps(q.alternative.steps)] : []),
    ...Object.values(q.flashcards).flatMap((c) => [c.front, c.back]),
    ...(q.reasoning ? [q.reasoning.prompt, ...q.reasoning.rubric, q.reasoning.modelAnswer] : []),
  ];
}

/** Every cue list in an instance, labelled for messages. */
function cueLists(q: QuestionInstance): [string, Cues][] {
  const out: [string, Cues][] = [
    ["consequence", q.consequence], ["resolution", q.resolution],
    ...q.hints.map((h, i) => [`hints[${i}]`, h.cues] as [string, Cues]),
    ...Object.entries(q.feedback).map(([k, s]) => [`feedback.${k}`, s.cues] as [string, Cues]),
    ...q.solution.map((s, i) => [`workedSolution[${i}]`, s.cues] as [string, Cues]),
    ...(q.alternative?.steps ?? []).map((s, i) => [`alternativeSolution[${i}]`, s.cues] as [string, Cues]),
    ...(q.options ?? []).map((o) => [`options.${o.id}`, o.cues] as [string, Cues]),
  ];
  return out;
}

/** Tags the template can produce through its declared misconceptions, options and rules. */
export function declaredTags(t: Template, q: QuestionInstance): string[] {
  const tags = new Set<string>();
  t.misconceptionRules.forEach((r) => r.tags.forEach((x) => tags.add(x)));
  (t.options ?? []).forEach((o) => o.tags?.forEach((x) => tags.add(x)));
  if (q.check.kind === "mapping") q.check.rules?.forEach((r) => r.tags.forEach((x) => tags.add(x)));
  if (q.check.kind === "diagram") {
    const r = q.check.rules;
    r.required.forEach((x) => [x.missingTags, x.wrongDirectionTags, x.wrongMagnitudeTags].forEach((ts) => ts?.forEach((y) => tags.add(y))));
    r.forbidden?.forEach((f) => f.tags.forEach((y) => tags.add(y)));
  }
  return [...tags];
}

const sameTags = (want: string[], got: string[]) => want.every((t) => got.includes(t));

export function validateTemplate(raw: unknown, opts: { file?: string; seeds?: number[] } = {}): { issues: Issue[]; template?: Template; instances: QuestionInstance[] } {
  const issues: Issue[] = [];
  const id = (raw as { id?: string })?.id ?? opts.file ?? "?";
  const err = (where: string, message: string) => issues.push({ level: "error", templateId: id, where, message });
  const warn = (where: string, message: string) => issues.push({ level: "warning", templateId: id, where, message });

  // 1. schema
  const parsed = TemplateSchema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) err(i.path.join(".") || "(root)", i.message);
    return { issues, instances: [] };
  }
  const t = parsed.data;
  if (opts.file) {
    const want = `${t.chapterId}/${t.primarySkillId}/${t.id}.json`;
    if (!opts.file.replace(/\\/g, "/").endsWith(want)) err("file", `File should live at content/templates/${want}`);
  }
  if (!t.id.startsWith(`${t.chapterId}.`)) err("id", "Template id must start with its chapter id");
  if (!t.skillIds.includes(t.primarySkillId)) err("primarySkillId", "primarySkillId must be one of skillIds");
  if (!t.intro.trim()) err("intro", "Intro text is required");

  // 2. parameters and solvers
  for (const [name, p] of Object.entries(t.parameters)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) err(`parameters.${name}`, "Parameter names must be letters and digits only (camelCase)");
    if ((p.kind === "int" || p.kind === "decimal") && p.min > p.max) err(`parameters.${name}`, "min is greater than max");
  }
  const solver = SOLVERS[t.solver];
  if (!solver) { err("solver", `Solver "${t.solver}" is not registered`); return { issues, template: t, instances: [] }; }
  for (const r of t.misconceptionRules) {
    if (!solver.buggy?.[r.match.buggySolver]) err("misconceptionRules", `Buggy solver "${r.match.buggySolver}" is not registered on ${t.solver}`);
  }
  if (["quantity", "number", "expression", "antiderivative", "equation", "set", "ordering"].includes(t.format) && t.misconceptionRules.length === 0) {
    warn("misconceptionRules", "No wrong-method (buggy) solvers: wrong answers will only get generic feedback");
  }

  // 2b. impossible parameters: how often a random draw satisfies the constraints and the solver
  if (Object.keys(t.parameters).length) {
    const r = rng(0x9e3779b9);
    let ok = 0;
    const draws = 300;
    for (let i = 0; i < draws; i++) {
      const p = sampleParams(t, r);
      try {
        if (!t.constraints.every((c) => constraintHolds(c, p))) continue;
        solver.solve(p);
        ok++;
      } catch (e) { if ((e as Error).message !== "reject") { err("parameters", `Solver failed for ${JSON.stringify(p)}: ${(e as Error).message}`); break; } }
    }
    if (ok === 0) err("parameters", "No parameter values satisfy the constraints and the solver: the template can never be instantiated");
    else if (ok / draws < 0.05) warn("parameters", `Only ${Math.round((ok / draws) * 100)}% of parameter draws are usable; narrow the ranges`);
  }

  // 3. widget
  const model = WIDGETS[t.widget.type];
  if (!model) { err("widget.type", `Widget "${t.widget.type}" is not registered`); return { issues, template: t, instances: [] }; }
  if (model.dragInputs || DRAG_FORMATS.has(t.format)) {
    if (!t.accessibility.nonDragAlternative) err("accessibility.nonDragAlternative", "This question can be answered by dragging, so it must describe the non-drag alternative");
  }
  if (t.format === "diagram" && t.widget.type !== "vector-board") err("widget.type", "Diagram questions must use the vector board");
  if (t.format === "interval" && t.widget.type !== "number-line") err("widget.type", "Interval questions must use the number line");

  // 4. instances across seeds
  const instances: QuestionInstance[] = [];
  const seeds = opts.seeds ?? VALIDATION_SEEDS;
  const seen = new Set<string>();
  for (const seed of seeds) {
    let q: QuestionInstance;
    try { q = instantiate(t, seed); } catch (e) { err(`seed ${seed}`, (e as Error).message); continue; }
    instances.push(q);
    seen.add(JSON.stringify(q.params));

    // determinism
    try { if (JSON.stringify(instantiate(t, seed)) !== JSON.stringify(q)) err(`seed ${seed}`, "Instantiating the same seed twice gave different questions"); } catch { /* reported above */ }

    // unresolved placeholders, broken numbers, dev language
    if (hasPlaceholder(q)) err(`seed ${seed}`, "Unresolved {{placeholder}} after filling");
    const text = studentText(q);
    const notText = text.find((s) => typeof s !== "string");
    if (notText !== undefined) err(`seed ${seed}`, `Student-facing text must be text, but got ${JSON.stringify(notText)}`);
    const bad = text.find((s) => /\b(NaN|undefined|Infinity|null)\b/.test(s) || /\[object /.test(s));
    if (bad) err(`seed ${seed}`, `Text contains a broken value: "${bad.slice(0, 80)}"`);
    const dev = text.find((s) => DEV_LANGUAGE.test(s));
    if (dev) err(`seed ${seed}`, `Student-facing text contains development language: "${dev.slice(0, 80)}"`);

    // the first two hints must not state the final answer
    if ((q.check.kind === "quantity" || q.check.kind === "number") && Number.isFinite(q.check.value)) {
      const v = q.check.value;
      const forms = [...new Set([formatValue(v), formatValue(v, "raw"), formatValue(v, "fixed2"), formatValue(Math.abs(v))])].filter((f) => f.replace(/[−-]/, "").length >= 2 || Math.abs(v) >= 10);
      for (const [i, h] of q.hints.slice(0, 2).entries()) {
        const hit = forms.find((f) => new RegExp(`(^|[^0-9.])${f.replace(/[.]/g, "\\.")}(?![0-9])`).test(h.text));
        if (hit) err(`seed ${seed} hints[${i}]`, `Hint ${i + 1} gives away the answer (${hit})`);
      }
    }

    // widget config and every cue
    let state: unknown;
    try { state = model.init(model.configSchema.parse(q.widget.config)); } catch (e) { err(`seed ${seed} widget.config`, (e as Error).message.slice(0, 300)); continue; }
    const sample = sampleContext(q);
    for (const [where, cues] of cueLists(q)) {
      for (const c of resolveCues(cues, sample)) {
        if (BASE_CUES.has(c.cue)) continue;
        const schema = model.cues[c.cue];
        if (!schema) { err(`seed ${seed} ${where}`, `Cue "${c.cue}" is not supported by ${t.widget.type}`); continue; }
        const ok = schema.safeParse(c.args ?? {});
        if (!ok.success) { err(`seed ${seed} ${where}`, `Cue "${c.cue}": ${ok.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`); continue; }
        try {
          const s2 = model.reduce(state, { type: "cue", cue: c.cue, args: c.args });
          const tl = model.timeline(s2);
          model.describe(s2, tl.duration);
        } catch (e) { err(`seed ${seed} ${where}`, `Cue "${c.cue}" failed when applied: ${(e as Error).message}`); }
      }
    }
    try { const tl = model.timeline(state); for (const k of tl.keyframes) model.describe(state, k); } catch (e) { err(`seed ${seed} widget`, `Description failed: ${(e as Error).message}`); }

    // the reference answer and the buggy answers really check the way the template claims
    for (const input of q.selfTest.correct) {
      const r = check(q.check, input);
      if (r.status !== "correct") err(`seed ${seed} answer`, `Accepted answer ${JSON.stringify(input)} checks as ${describe(r)}`);
    }
    for (const b of q.selfTest.buggy) {
      const r = check(q.check, b.input);
      if (r.status !== "incorrect" || !sameTags(b.tags, r.tags)) err(`seed ${seed} misconception`, `Wrong answer ${JSON.stringify(b.input)} should be tagged ${b.tags.join(", ")} but checks as ${describe(r)}`);
      // the consequence must be playable for every buggy answer
      for (const c of resolveCues(q.consequence, { result: r, input: b.input })) {
        if (!BASE_CUES.has(c.cue) && !model.cues[c.cue]?.safeParse(c.args ?? {}).success) err(`seed ${seed} consequence`, `Cue "${c.cue}" can't be built for the wrong answer ${JSON.stringify(b.input)}`);
      }
    }
  }
  if (instances.length && seen.size < Math.min(5, seeds.length) && Object.keys(t.parameters).some((k) => t.parameters[k]!.kind !== "const")) {
    warn("parameters", `Only ${seen.size} distinct variations across ${seeds.length} seeds`);
  }

  // 4b. answer sanity and unit consistency
  const numeric = instances.map((q) => ("value" in q.check && typeof q.check.value === "number" ? q.check.value : null)).filter((v): v is number => v !== null);
  if (numeric.some((v) => !Number.isFinite(v))) err("answer", "The solver produced a non-finite answer");
  else if (numeric.length && numeric.some((v) => v !== 0 && (Math.abs(v) > 1e9 || Math.abs(v) < 1e-9))) warn("answer", "Some answers are extremely large or small; check the units and the parameter ranges");
  if (numeric.length > 4 && new Set(numeric.map((v) => v.toPrecision(9))).size === 1 && t.format !== "single-choice") warn("answer", "The answer is the same for every variation");
  if (t.format === "quantity" && instances[0]) {
    const want = dimsOf((instances[0].check as { dimension: Parameters<typeof dimsOf>[0] }).dimension);
    const unitDims = (text: string) => {
      const m = /(-?\d[\d.,]*(?:e[-+]?\d+)?)\s*([^\d\s(][^()]*)$/i.exec(text.replace(/\(.*\)\s*$/, "").replace(/^for example\s+/i, "").replace(/−/g, "-").trim());
      if (!m) return null;
      const q = parseQuantity(`${m[1]!.replace(/,/g, "")} ${m[2]!.trim()}`);
      return typeof q === "string" || !q.unit ? null : q.unit.dims;
    };
    const ph = t.input?.placeholder ? unitDims(t.input.placeholder) : null;
    if (ph && !sameDims(ph, want)) err("input.placeholder", `The example answer's unit doesn't match the answer's dimension (${String((instances[0].check as { dimension: string }).dimension)})`);
    const at = unitDims(instances[0].answerText);
    if (at && !sameDims(at, want)) err("answerText", "The answer text's unit doesn't match the answer's dimension");
  }
  if (t.format === "number" && t.input?.placeholder && /\d\s*(m|s|kg|N|J|W|V|A|Ω)\b/.test(t.input.placeholder)) warn("input.placeholder", "A number answer's example shows a unit; use the quantity format for physical quantities");

  // 5. feedback and flashcards cover every declared misconception tag; worked solution drives the visual
  const q0 = instances[0];
  if (q0) {
    for (const tag of declaredTags(t, q0)) {
      if (!q0.feedback[tag]) err(`feedback.${tag}`, `Misconception tag "${tag}" has no feedback`);
      if (!q0.flashcards[tag] && (t.misconceptionRules.some((r) => r.tags.includes(tag)) || t.options?.some((o) => o.tags?.includes(tag)))) err(`flashcards.${tag}`, `Misconception tag "${tag}" has no flashcard`);
    }
    for (const k of Object.keys(q0.feedback)) if (!q0.feedback[k]!.text.trim()) err(`feedback.${k}`, "Empty feedback text");
    const solutionCues = q0.solution.filter((s) => s.cues.length).length;
    if (solutionCues === 0) err("workedSolution", "The worked solution never drives the visual: add a cue to at least one step");
    const visualFeedback = Object.values(q0.feedback).some((s) => s.cues.length) || q0.consequence.length > 0 || (q0.options ?? []).some((o) => o.cues.length);
    if (!visualFeedback && model.interactive) warn("feedback", "No misconception feedback or consequence animates the visual");
    if (q0.hints.every((h) => !h.cues.length)) warn("hints", "No hint drives the visual");
  }
  return { issues, template: t, instances };
}

function describe(r: CheckResult) {
  return r.status === "incorrect" ? `incorrect [${r.tags.join(", ")}]` : r.status === "correct" ? "correct" : `${r.status} (${r.message})`;
}

/** A representative wrong-answer context for checking cue arguments that use `$` tokens. */
function sampleContext(q: QuestionInstance): { result: CheckResult; input: CheckInput } {
  const b = q.selfTest.buggy[0];
  if (b) return { result: check(q.check, b.input), input: b.input };
  const input = q.selfTest.correct[0] ?? "";
  const value = "value" in q.check ? q.check.value : undefined;
  return { result: { status: "incorrect", tags: [], details: { valueSI: value, value, endpointMismatches: [] } }, input: typeof input === "string" ? input : "" };
}

/** The variations a reviewer must see: the first REVIEW_SEED_COUNT validation seeds, plus a seed for any
 *  variant (or choice value of the variant parameter) those don't cover. */
export function reviewSeedsFor(t: Template): number[] {
  const seeds = VALIDATION_SEEDS.slice(0, REVIEW_SEED_COUNT);
  if (!t.variants) return seeds;
  const want = new Set(Object.keys(t.variants.cases));
  const p = t.parameters[t.variants.param];
  if (p?.kind === "choice") p.values.forEach((v) => want.add(String(v)));
  const seen = new Set<string>();
  const out = [...seeds];
  for (const s of seeds) { try { seen.add(String(instantiate(t, s).params[t.variants.param])); } catch { /* reported by validation */ } }
  for (let s = 1; s < 5000 && [...want].some((w) => !seen.has(w)); s += 13) {
    try {
      const v = String(instantiate(t, s).params[t.variants.param]);
      if (want.has(v) && !seen.has(v)) { seen.add(v); out.push(s); }
    } catch { /* ignore */ }
  }
  return out;
}
