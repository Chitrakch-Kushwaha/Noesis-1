// Pure lesson validation, shared by content:validate, the review tool and unit tests.
import { WIDGETS } from "@/src/widgets/registry";
import { lessonCues as asCues, lessonVariant, LessonSchema, type Lesson, type LessonVariant } from "./lessons";
import { DEV_LANGUAGE, type Issue } from "./validate";

const BASE_CUES = new Set(["clear-overlay", "reset"]);

export function validateLesson(raw: unknown, opts: { file?: string; knownSkill?: (id: string) => boolean } = {}): { issues: Issue[]; lesson?: Lesson } {
  const issues: Issue[] = [];
  const id = (raw as { id?: string })?.id ?? opts.file ?? "?";
  const err = (where: string, message: string) => issues.push({ level: "error", templateId: id, where, message });
  const parsed = LessonSchema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) err(i.path.join(".") || "(root)", i.message);
    return { issues };
  }
  const l = parsed.data;
  if (l.id !== `${l.skillId}.lesson`) err("id", `Lesson id must be "${l.skillId}.lesson"`);
  if (opts.file && !opts.file.replace(/\\/g, "/").endsWith(`content/lessons/${l.id}.json`)) err("file", `File should live at content/lessons/${l.id}.json`);
  if (opts.knownSkill && !opts.knownSkill(l.skillId)) err("skillId", `Unknown skill or foundation ${l.skillId}`);
  if (l.kind === "micro-lesson" && !l.alternate) err("alternate", "A micro-lesson needs an alternate representation for its repeat");
  const variants: LessonVariant[] = ["main", ...(l.alternate ? ["alternate" as const] : []), ...(l.recap ? ["recap" as const] : [])];
  for (const v of variants) {
    const { widget, steps } = lessonVariant(l, v);
    const model = WIDGETS[widget.type];
    if (!model) { err(`${v}.widget.type`, `Widget "${widget.type}" is not registered`); continue; }
    if (!model.interactive) err(`${v}.widget.type`, "Lessons must use an interactive widget");
    if (model.dragInputs && !l.accessibility.nonDragAlternative) err("accessibility.nonDragAlternative", "This lesson's widget is dragged, so it must describe the non-drag alternative");
    let state: unknown;
    try { state = model.init(model.configSchema.parse(widget.config)); } catch (e) { err(`${v}.widget.config`, (e as Error).message.slice(0, 300)); continue; }
    if (!steps.some((s) => asCues(s.cue).length)) err(`${v}.steps`, "No step drives the visual");
    steps.forEach((s, i) => {
      for (const c of asCues(s.cue)) {
        if (BASE_CUES.has(c.cue)) continue;
        const schema = model.cues[c.cue];
        if (!schema) { err(`${v}.steps[${i}]`, `Cue "${c.cue}" is not supported by ${widget.type}`); continue; }
        const ok = schema.safeParse(c.args ?? {});
        if (!ok.success) { err(`${v}.steps[${i}]`, `Cue "${c.cue}": ${ok.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`); continue; }
        try { state = model.reduce(state, { type: "cue", cue: c.cue, args: c.args }); model.describe(state, model.timeline(state).duration); }
        catch (e) { err(`${v}.steps[${i}]`, `Cue "${c.cue}" failed when applied: ${(e as Error).message}`); }
      }
    });
  }
  const text = [l.title, l.widget.instructions, l.accessibility.altText, l.accessibility.nonDragAlternative ?? "", ...l.steps.map((s) => s.text),
    ...(l.alternate ? [l.alternate.title, ...l.alternate.steps.map((s) => s.text)] : []), ...(l.recap ?? []).map((s) => s.text)];
  const dev = text.find((s) => DEV_LANGUAGE.test(s));
  if (dev) err("text", `Student-facing text contains development language: "${dev.slice(0, 80)}"`);
  if (text.some((s) => /\{\{/.test(s))) err("text", "Lessons are not parameterised: remove {{placeholders}}");
  return { issues, lesson: l };
}
