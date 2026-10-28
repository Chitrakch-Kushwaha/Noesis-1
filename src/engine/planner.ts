// Detour planner (docs/04): from a failed skill and the misconception evidence, choose which
// prerequisites to probe. Pure. Guards: cycles (nothing already on the stack), sibling detours,
// class (never route forward into a later class, U-03) and available content.
import { implicates } from "@/src/content/misconceptions";
import { ancestorsWithDistance, classOf } from "./graph";

export interface PlanInput {
  skillId: string;
  tags: string[];
  /** skills of every frame and suspended question on the stack (cycle guard) */
  onStack: ReadonlySet<string>;
  /** skills already probed or detoured under this suspended question */
  excluded: ReadonlySet<string>;
  studentClass: 11 | 12;
  /** content exists to probe and then practise this skill */
  hasContent(skillId: string): boolean;
  /** existing evidence strength (higher = stronger); weakest is preferred */
  strength(skillId: string): number;
  isIndependent(skillId: string): boolean;
}

export type Plan =
  | { kind: "candidates"; candidates: { skillId: string; support: number; distance: number }[] }
  | { kind: "class-ahead"; skillId: string }
  | { kind: "none"; reason: "no-candidate" | "no-content" };

export function planDetour(p: PlanInput): Plan {
  const dist = ancestorsWithDistance(p.skillId);
  const open = [...dist.keys()].filter((id) => !p.onStack.has(id) && !p.excluded.has(id));
  const support = (id: string) => p.tags.filter((t) => implicates(t).includes(id)).length;
  const rank = (list: string[]) => {
    const tagged = list.filter((id) => support(id) > 0)
      .sort((a, b) => support(b) - support(a) || dist.get(a)! - dist.get(b)! || p.strength(a) - p.strength(b) || a.localeCompare(b));
    // fallback: direct prerequisites without independent evidence, weakest first
    const direct = list.filter((id) => dist.get(id) === 1 && !p.isIndependent(id) && !tagged.includes(id))
      .sort((a, b) => p.strength(a) - p.strength(b) || a.localeCompare(b));
    return [...tagged, ...direct];
  };
  const inClass = rank(open.filter((id) => (classOf(id) ?? 0) <= p.studentClass));
  const available = inClass.filter((id) => p.hasContent(id));
  if (available.length) return { kind: "candidates", candidates: available.map((id) => ({ skillId: id, support: support(id), distance: dist.get(id)! })) };
  if (inClass.length) return { kind: "none", reason: "no-content" };
  const ahead = rank(open.filter((id) => (classOf(id) ?? 0) > p.studentClass));
  if (ahead.length) return { kind: "class-ahead", skillId: ahead[0]! };
  return { kind: "none", reason: "no-candidate" };
}
