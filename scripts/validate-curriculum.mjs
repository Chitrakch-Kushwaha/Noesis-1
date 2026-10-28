#!/usr/bin/env node
// Validates the curriculum graph and regenerates derived artefacts.
// Zero dependencies: run with `node scripts/validate-curriculum.mjs` (Node 18+).
// Exit code 1 on any rule violation. Pass --no-write to validate without regenerating files.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const write = (p, s) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), s); };

const { chapters } = read("content/curriculum/chapters.json");
const { foundations } = read("content/curriculum/foundations.json");
const { skills } = read("content/curriculum/skills.json");
const { links } = read("content/curriculum/related-links.json");

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);

// ---------- indexes ----------
const chapterById = new Map(chapters.map((c) => [c.id, c]));
const node = new Map(); // id -> {kind, ...}
for (const f of foundations) {
  if (node.has(f.id)) err(`Duplicate id ${f.id}`);
  node.set(f.id, { ...f, kind: "foundation" });
}
for (const s of skills) {
  if (node.has(s.id)) err(`Duplicate id ${s.id}`);
  const ch = chapterById.get(s.chapter);
  if (!ch) { err(`Skill ${s.id} references unknown chapter ${s.chapter}`); continue; }
  if (!s.id.startsWith(`${s.chapter}.`)) err(`Skill ${s.id} id must start with "${s.chapter}."`);
  node.set(s.id, { ...s, kind: "skill", subject: ch.subject, class: ch.class });
}
if (chapters.length !== 24) err(`Expected 24 chapters, found ${chapters.length}`);

// ---------- edge rules ----------
for (const n of node.values()) {
  for (const p of n.prereqs) {
    const pre = node.get(p);
    if (!pre) { err(`${n.id} -> unknown prerequisite ${p}`); continue; }
    if (p === n.id) err(`${n.id} lists itself as a prerequisite`);
    if (n.kind === "foundation" && pre.kind !== "foundation")
      err(`Foundation ${n.id} may only depend on foundations (found ${p})`);
    if (n.kind === "skill" && pre.kind === "skill") {
      if (pre.class > n.class) err(`FORWARD-CLASS: ${n.id} (Class ${n.class}) requires ${p} (Class ${pre.class})`);
      if (pre.subject !== n.subject) err(`CROSS-SUBJECT hard edge: ${n.id} (${n.subject}) requires ${p} (${pre.subject})`);
    }
  }
}
for (const f of foundations) if (!["pre-11", "bridge-11"].includes(f.level)) err(`Foundation ${f.id} has invalid level ${f.level}`);

// ---------- acyclicity (DFS with path report) ----------
const state = new Map();
const order = [];
function dfs(id, path) {
  const st = state.get(id);
  if (st === 2) return;
  if (st === 1) { err(`CYCLE: ${[...path.slice(path.indexOf(id)), id].join(" -> ")}`); return; }
  state.set(id, 1);
  for (const p of node.get(id)?.prereqs ?? []) if (node.has(p)) dfs(p, [...path, id]);
  state.set(id, 2);
  order.push(id); // prerequisites first
}
for (const id of node.keys()) dfs(id, []);

// ---------- depth to a foundation (longest prerequisite chain) ----------
const depth = new Map();
for (const id of order) {
  const n = node.get(id);
  const ds = n.prereqs.filter((p) => node.has(p)).map((p) => depth.get(p) + 1);
  depth.set(id, ds.length ? Math.max(...ds) : 0);
}
// every skill must bottom out in at least one foundation, so detours can terminate in a micro-lesson
const reachesFoundation = new Map();
for (const id of order) {
  const n = node.get(id);
  reachesFoundation.set(id, n.kind === "foundation" || n.prereqs.some((p) => reachesFoundation.get(p)));
}
for (const s of skills) if (!reachesFoundation.get(s.id)) err(`Skill ${s.id} never reaches a foundation micro-skill`);

const usedFoundations = new Set(skills.flatMap((s) => s.prereqs).filter((p) => node.get(p)?.kind === "foundation"));
for (const f of foundations) for (const p of f.prereqs) usedFoundations.add(p);
for (const f of foundations) if (!usedFoundations.has(f.id)) warnings.push(`Foundation ${f.id} is not used by any skill`);

// ---------- chapter-level derived graph ----------
const chEdges = new Map(); // "a>b" -> [skill edges]
for (const s of skills) for (const p of s.prereqs) {
  const pre = node.get(p);
  if (pre?.kind === "skill" && pre.chapter !== s.chapter) {
    const k = `${pre.chapter}>${s.chapter}`;
    if (!chEdges.has(k)) chEdges.set(k, []);
    chEdges.get(k).push(`${p} → ${s.id}`);
  }
}
const chAdj = new Map(chapters.map((c) => [c.id, new Set()]));
for (const k of chEdges.keys()) { const [a, b] = k.split(">"); chAdj.get(a).add(b); }
// chapter cycle check
const cState = new Map();
const chOrder = [];
function cdfs(id, path) {
  if (cState.get(id) === 2) return;
  if (cState.get(id) === 1) { err(`CHAPTER CYCLE: ${[...path.slice(path.indexOf(id)), id].join(" -> ")}`); return; }
  cState.set(id, 1);
  for (const b of chAdj.get(id)) cdfs(b, [...path, id]);
  cState.set(id, 2);
  chOrder.unshift(id);
}
for (const c of chapters) cdfs(c.id, []);
// transitive reduction for display
const reach = (from, skipDirect) => {
  const seen = new Set(); const stack = [...chAdj.get(from)].filter((x) => x !== skipDirect);
  while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); stack.push(...chAdj.get(x)); }
  return seen;
};
const displayEdges = [];
for (const [a, outs] of chAdj) for (const b of outs) if (!reach(a, b).has(b)) displayEdges.push([a, b]);
// layer = longest path from a root (used as the initial vertical layout seed)
const layer = new Map();
for (const id of chOrder) {
  const preds = [...chAdj].filter(([, outs]) => outs.has(id)).map(([a]) => a);
  layer.set(id, preds.length ? Math.max(...preds.map((p) => layer.get(p) ?? 0)) + 1 : 0);
}

// ---------- related links ----------
for (const l of links) {
  const a = chapterById.get(l.a), b = chapterById.get(l.b);
  if (!a || !b) { err(`Related link ${l.a}—${l.b} references unknown chapter`); continue; }
  if (l.a === l.b) err(`Related link ${l.a}—${l.b} links a chapter to itself`);
  if (!l.note || l.note.length < 20) err(`Related link ${l.a}—${l.b} needs an explanatory note`);
  if (chAdj.get(l.a)?.has(l.b) || chAdj.get(l.b)?.has(l.a))
    err(`Related link ${l.a}—${l.b} duplicates a hard prerequisite edge; remove one of them`);
  const pair = [l.a, l.b].sort().join("—");
  if (pair === "int—wep") err(`Related link Integrals—Work, Energy and Power is excluded by decision D-012`);
}

// ---------- Class 11 student view of Class 12 chapters (informational) ----------
const class12PrereqsByChapter = {};
for (const c of chapters.filter((c) => c.class === 12)) {
  const inner = skills.filter((s) => s.chapter === c.id);
  const blocked = new Set();
  for (const s of inner) for (const p of s.prereqs) {
    const pre = node.get(p);
    if (pre?.kind === "skill" && pre.class === 12 && pre.chapter !== c.id) blocked.add(p);
  }
  class12PrereqsByChapter[c.id] = [...blocked];
}

// ---------- mastery feasibility against config ----------
const cfg = read("config/learning.config.json");
for (const c of chapters) {
  const required = skills.filter((s) => s.chapter === c.id && s.required).length;
  if (required < 3) err(`Chapter ${c.id} has only ${required} required skills (minimum 3)`);
  // coverage needs one independent-correct per required skill; window needs minIndependent of windowSize,
  // so a perfect run of windowSize questions must be able to cover every required skill.
  if (required > cfg.mastery.windowSize) err(`Chapter ${c.id} has ${required} required skills; mastery within ${cfg.mastery.windowSize} questions is impossible`);
  if (cfg.mastery.minHardIndependentCorrectInWindow > cfg.mastery.windowSize) err("Hard requirement exceeds window size");
}

// ---------- report ----------
const bySubjectClass = {};
for (const c of chapters) {
  const k = `${c.subject} ${c.class}`;
  bySubjectClass[k] = (bySubjectClass[k] ?? 0) + 1;
}
const widgets = {};
for (const n of node.values()) widgets[n.widget] = (widgets[n.widget] ?? 0) + 1;
const maxDepth = Math.max(...skills.map((s) => depth.get(s.id) ?? 0));

const summary = {
  chapters: chapters.length, skills: skills.length, foundations: foundations.length,
  skillEdges: [...node.values()].reduce((a, n) => a + n.prereqs.length, 0),
  chapterEdgesDerived: chEdges.size, chapterEdgesDisplayed: displayEdges.length,
  maxPrereqChainDepth: maxDepth, chaptersPerSubjectClass: bySubjectClass, widgetUse: widgets,
};

console.log("Curriculum summary:", JSON.stringify(summary, null, 2));
for (const w of warnings) console.warn("WARN", w);
for (const e of errors) console.error("ERROR", e);

if (!process.argv.includes("--no-write") && errors.length === 0) {
  const title = (id) => chapterById.get(id).title;
  const generated = {
    $comment: "GENERATED by scripts/validate-curriculum.mjs — do not edit by hand.",
    summary,
    chapterEdges: [...chEdges].map(([k, via]) => { const [from, to] = k.split(">"); return { from, to, via }; }),
    displayEdges: displayEdges.map(([from, to]) => ({ from, to })),
    chapterLayer: Object.fromEntries(layer),
    skillDepth: Object.fromEntries([...depth].filter(([id]) => node.get(id).kind === "skill")),
    class12PrereqsOutsideChapter: class12PrereqsByChapter,
  };

  // Mermaid: chapter graph (transitively reduced)
  const cls = (c) => `${c.subject}${c.class}`;
  let mmd = "flowchart TB\n";
  for (const k of ["physics11", "maths11", "physics12", "maths12"]) {
    const [subj, cl] = [k.replace(/\d+/, ""), k.match(/\d+/)[0]];
    mmd += `  subgraph ${k}["${subj === "physics" ? "Physics" : "Maths"} · Class ${cl}"]\n`;
    for (const c of chapters.filter((c) => cls(c) === k)) mmd += `    ${c.id}["${c.title}"]\n`;
    mmd += "  end\n";
  }
  for (const [a, b] of displayEdges) mmd += `  ${a} --> ${b}\n`;
  for (const l of links) mmd += `  ${l.a} -. related .- ${l.b}\n`;
  mmd += `  subgraph legend["Legend"]\n    direction LR\n    lgA["Chapter A"] -->|"prerequisite (can trigger remediation)"| lgB["Chapter B"]\n    lgC["Chapter C"] -.-|"related concept (never triggers remediation)"| lgD["Chapter D"]\n  end\n`;
  write("docs/diagrams/chapter-graph.mmd", mmd);

  // Coverage matrix: can every required skill be assessed inside the "last 10 main questions" rule?
  const W = cfg.mastery.windowSize, need = cfg.mastery.minIndependentCorrectInWindow;
  const cap = cfg.session.mainQuestionCap, needHard = cfg.mastery.minHardIndependentCorrectInWindow;
  const coverageRows = [];
  for (const c of chapters) {
    const req = skills.filter((s) => s.chapter === c.id && s.required);
    const R = req.length;
    // engine's first pick: the required skill with most same-chapter dependents (transitively); ties → earliest in file
    const dependents = (id) => { const seen = new Set(); const st = [id];
      while (st.length) { const x = st.pop(); for (const s of req) if (s.prereqs.includes(x) && !seen.has(s.id)) { seen.add(s.id); st.push(s.id); } }
      return seen.size; };
    const first = [...req].sort((a, b) => dependents(b.id) - dependents(a.id))[0];
    // remaining in topological order (prerequisites first) — order[] is already prerequisites-first
    const rest = order.filter((id) => req.some((s) => s.id === id) && id !== first.id);
    const schedule = [first.id, ...rest];
    const indepNeededAt10 = Math.max(need, R);
    const missesAt10 = W - indepNeededAt10;
    const maxMissesByCap = cap - Math.max(need, R); // best case: misses early, so they leave the window
    coverageRows.push({ chapter: c.id, title: c.title, required: R, schedule, freeSlots: W - R, missesAt10, maxMissesByCap,
      hardInPerfectRun: W - 1 });
    if (R > W) err(`Coverage: ${c.id} cannot be covered in ${W}`);
    if (W - 1 < needHard) err(`Coverage: a perfect run of ${c.id} cannot reach ${needHard} hard questions`);
  }
  generated.coverage = { windowSize: W, minIndependent: need, minHard: needHard, cap, rows: coverageRows };
  write("content/curriculum/curriculum.generated.json", JSON.stringify(generated, null, 2) + "\n");
  let cm = `# Mastery coverage matrix (generated)\n\n> GENERATED by \`node scripts/validate-curriculum.mjs\` from the curriculum and \`config/learning.config.json\`. Do not edit.\n\n`;
  cm += `**Rule being tested:** mastery needs, in the **last ${W} main questions**, at least **${need}** independent (first-attempt, unaided) correct answers and at least **${needHard}** of them hard. Every **required skill** also needs at least one independent correct answer in the session. The session cap is **${cap}** main questions.\n\n`;
  cm += `**How to read a row:**\n\n- **Perfect-run order** is the order the selection rules would use for a student who answers everything independently: the most central skill first (at medium), then the remaining required skills prerequisites-first (at hard after the first independent answer). Every required skill gets a slot inside the first ${W} questions, so all of them can be assessed within the window.\n- **Free slots** are the questions left over for revisiting.\n- **Misses tolerated at Q${W}** = ${W} − max(${need}, required): how many questions can go wrong while mastery is still reachable at question ${W}.\n- **Max misses before cap** is the best case (the misses happen early and drop out of the window): mastery is still reachable by question ${cap} with up to this many non-independent main answers in the session.\n\n`;
  cm += `| Chapter | Required | Perfect-run order (Q1…) | Free slots | Misses tolerated at Q${W} | Max misses before cap (Q${cap}) | Hard answers in perfect run |\n|---|---|---|---|---|---|---|\n`;
  for (const r of coverageRows) cm += `| ${r.title} | ${r.required} | ${r.schedule.map((s, i) => `${i + 1}·${s.split(".")[1]}`).join(" ")} | ${r.freeSlots} | ${r.missesAt10} | ${r.maxMissesByCap} | ${r.hardInPerfectRun} |\n`;
  cm += `\nThe tightest chapter is ${coverageRows.reduce((a, b) => (b.required > a.required ? b : a)).title}, with ${Math.max(...coverageRows.map((r) => r.required))} required skills: it tolerates ${Math.min(...coverageRows.map((r) => r.missesAt10))} miss at Q${W}. The validator fails if any chapter has more required skills than the window holds, or if a perfect run cannot reach the hard requirement.\n`;
  write("docs/generated/coverage-matrix.md", cm);

  // Markdown report with per-chapter skill tables and neighbourhood diagrams
  let md = `# Curriculum graph (generated)\n\n> GENERATED by \`node scripts/validate-curriculum.mjs\` from \`content/curriculum/*.json\`. Edit the JSON, not this file.\n\n`;
  md += `**${summary.chapters} chapters · ${summary.skills} skills · ${summary.foundations} foundation micro-skills · ${summary.skillEdges} prerequisite edges.** Longest prerequisite chain from a chapter skill down to a foundation: ${maxDepth} steps (runtime detours are capped at 4 levels; see docs/04).\n\n`;
  md += `Checks passed: every reference resolves; no cycles (skill or chapter level); no prerequisite in a later class; no hard Physics↔Maths edges; every skill bottoms out in a foundation micro-skill.\n\n`;
  md += `## Chapter graph\n\nSolid arrows are derived from skill prerequisites (transitively reduced for display). Dotted lines labelled "related" are related-concept links: they never gate and never trigger remediation.\n\n\`\`\`mermaid\n${mmd}\`\`\`\n\n`;
  md += `### Why each chapter edge exists\n\n| From | To | Because (skill edges) |\n|---|---|---|\n`;
  for (const [k, via] of chEdges) { const [a, b] = k.split(">"); md += `| ${title(a)} | ${title(b)} | ${via.join("; ")} |\n`; }
  md += `\n### Class 12 chapters: Class 12 prerequisites a Class 11 student will not be routed into\n\n| Chapter | Class 12 prerequisite skills outside the chapter |\n|---|---|\n`;
  for (const [c, list] of Object.entries(class12PrereqsByChapter)) md += `| ${title(c)} | ${list.length ? list.join(", ") : "none — all prerequisites are Class 11 or foundations"} |\n`;
  md += `\n## Skills by chapter\n\n`;
  for (const c of chapters) {
    const inner = skills.filter((s) => s.chapter === c.id);
    md += `### ${title(c.id)} · ${c.subject === "physics" ? "Physics" : "Maths"} ${c.class}\n\n| Skill | Prerequisites | Widget | Depth |\n|---|---|---|---|\n`;
    for (const s of inner) {
      const pre = s.prereqs.map((p) => (node.get(p).kind === "foundation" ? `*${p}*` : node.get(p).chapter === c.id ? p : `**${p}**`)).join(", ");
      md += `| \`${s.id}\` ${s.title} | ${pre} | ${s.widget} | ${depth.get(s.id)} |\n`;
    }
    md += `\n`;
  }
  md += `Legend: plain = same chapter, **bold** = another chapter, *italic* = foundation micro-skill.\n\n## Foundation micro-skills\n\n| Id | Title | Level | Widget | Prerequisites |\n|---|---|---|---|---|\n`;
  for (const f of foundations) md += `| \`${f.id}\` | ${f.title} | ${f.level} | ${f.widget} | ${f.prereqs.join(", ") || "—"} |\n`;
  md += `\n## Soft related links\n\n| Chapter | Chapter | Relationship |\n|---|---|---|\n`;
  for (const l of links) md += `| ${title(l.a)} | ${title(l.b)} | ${l.note} |\n`;
  write("docs/generated/curriculum-graph.md", md);
  console.log("Wrote content/curriculum/curriculum.generated.json, docs/diagrams/chapter-graph.mmd, docs/generated/curriculum-graph.md");
}

process.exit(errors.length ? 1 : 0);
