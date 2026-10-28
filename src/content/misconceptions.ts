// Misconception catalogues (docs/05): each tag lists the skills whose weakness it is evidence of.
// The detour planner intersects `implicates` with the prerequisite closure of the failed skill.
// `content:validate` validates every content/misconceptions/*.json file and merges them into
// src/content/generated/misconceptions.json, so adding a chapter's catalogue needs no code change.
import { z } from "zod";
import generated from "./generated/misconceptions.json";

export const Catalogue = z.object({
  chapter: z.string(),
  status: z.enum(["draft", "in-review", "approved"]),
  misconceptions: z.array(z.object({
    tag: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string().min(10),
    implicates: z.array(z.string()).min(1),
    visualCue: z.string().nullable(),
    flashcard: z.object({ front: z.string(), back: z.string() }),
  })),
});
export type Catalogue = z.infer<typeof Catalogue>;

export const CATALOGUES: Catalogue[] = (generated as { catalogues: unknown[] }).catalogues.map((c) => Catalogue.parse(c));

const index = new Map<string, Set<string>>();
for (const c of CATALOGUES) for (const m of c.misconceptions) {
  const s = index.get(m.tag) ?? new Set<string>();
  m.implicates.forEach((x) => s.add(x));
  index.set(m.tag, s);
}

/** Skills a misconception tag is evidence against (empty for unknown tags). */
export const implicates = (tag: string): string[] => [...(index.get(tag) ?? [])];
export const knownTag = (tag: string) => index.has(tag);
