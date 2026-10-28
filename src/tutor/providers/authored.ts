// AuthoredHintsProvider: the always-available tutor. It never generates content: every reply is the
// lesson's own reviewed material (hints, misconception feedback, instructions) or a short authored
// prompt that points at an element of the visual. No network, no AI.
import type { ProviderOutput, TutorProvider, TutorRequest, TutorTool } from "../contract";
import type { TutorMaterial } from "../context";

const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** A short guiding question about one element of the visual, with the highlight that goes with it. */
function guideVisual(m: TutorMaterial): ProviderOutput {
  const t = m.visual.targets;
  const pick = (prefix: string) => t.find((x) => x.id.startsWith(prefix));
  const hl = (id: string): TutorTool[] => [{ name: "highlight", args: { target: id } }];
  if (m.visual.type === "vector-board") {
    const f = t.find((x) => x.id.startsWith("force:"));
    if (!f) return { kind: "guidance", say: "Start with gravity: add the weight first, then one force for each thing that touches the body. For each one, ask which object exerts it.", tools: [] };
    const name = f.label.replace(/\s*\(from [^)]*\)$/, "");
    return { kind: "guidance", say: `Look at the highlighted ${lowerFirst(name)}. Which object is exerting this force, and what interaction produces it?`, tools: hl(f.id) };
  }
  if (m.visual.type === "graph-plot") {
    const tan = pick("tangent:"), pt = pick("point:"), area = pick("area:"), curve = pick("curve:");
    if (tan && pt) return { kind: "guidance", say: `Move ${pt.label} along the curve and compare how the slope of the tangent changes. Where is it steepest?`, tools: hl(tan.id) };
    if (area) return { kind: "guidance", say: `Look at ${area.label}. What quantity does that area stand for in this question?`, tools: hl(area.id) };
    if (pt) return { kind: "guidance", say: `Move ${pt.label} and watch its coordinates. Which reading does the question need?`, tools: hl(pt.id) };
    if (curve) return { kind: "guidance", say: `Look at ${lowerFirst(curve.label)}. What does its shape tell you about the quantity it shows?`, tools: hl(curve.id) };
  }
  if (m.visual.type === "motion-track") {
    const lane = pick("lane:");
    if (lane) return { kind: "guidance", say: `Watch ${lane.label} as it plays. Pause and step through: how do the gaps between its positions change, and what does that say about its speed?`, tools: hl(lane.id) };
  }
  if (m.visual.type === "number-line") {
    const end = pick("endpoint:");
    if (end) return { kind: "guidance", say: `Look at ${end.label}. Should that number itself be in the set? Toggle it and compare the two.`, tools: hl(end.id) };
  }
  if (m.visual.type === "triangle-explorer") {
    return { kind: "guidance", say: "Which side is adjacent to the marked angle? It touches the angle but isn't the hypotenuse.", tools: hl("side:adjacent") };
  }
  return { kind: "guidance", say: `Use the visual: ${firstSentence(m.visual.instructions)}`, tools: [] };
}

/** Compose an authored reply for an action. The orchestrator validates it like any other output. */
export function authoredOutput(m: TutorMaterial, req: Pick<TutorRequest, "action">): ProviderOutput {
  const p = m.permissions;
  const ended = p.solutionAllowed;
  switch (req.action) {
    case "begin": {
      if (ended) return { kind: "guidance", say: "You've finished this question. Step through the worked solution to see each step on the visual.", tools: [] };
      const asks = m.answerLabel ? `The question asks for the ${lowerFirst(m.answerLabel)}.` : "Read what the question asks you to find.";
      return { kind: "guidance", say: `${asks} Before you calculate, what do you expect it to be? ${firstSentence(m.visual.instructions)}`, tools: [] };
    }
    case "next-hint": {
      if (p.nextHintLevel === null) {
        return ended
          ? { kind: "guidance", say: "This question has ended, so there are no more hints. The worked solution shows every step.", tools: [] }
          : { kind: "guidance", say: "You've seen every hint. If you're still stuck, “Show me the solution” steps through it on the visual.", tools: [] };
      }
      const h = m.hints[p.nextHintLevel - 1]!;
      const tools: TutorTool[] = p.tools.includes("show_hint") ? [{ name: "show_hint", args: { level: p.nextHintLevel } }] : [];
      return { kind: "guidance", say: h.text, tools };
    }
    case "explain-mistake": {
      const wrong = [...m.attempts].reverse().find((a) => a.status === "incorrect");
      if (!wrong) return { kind: "guidance", say: "You haven't checked a wrong answer yet, so there's no mistake to explain. Try an answer, or ask for the next hint.", tools: [] };
      return { kind: "guidance", say: wrong.feedback, tools: [] };
    }
    case "guide-visual":
      return guideVisual(m);
    case "ask":
      return { kind: "redirect", say: "Typed questions need the live tutor, which is turned off. I can still give the next hint, explain your last mistake or guide you through the visual.", tools: [] };
  }
}

export const authoredHintsProvider: TutorProvider = {
  id: "authored-hints",
  mode: "authored",
  capabilities: { text: true, freeText: false, transcribe: false, speak: false, voiceGrant: false },
  async turn(material, req) { return authoredOutput(material, req); },
};
