// Deterministic per-view roadmap layout computed from the corrected graph (pure; unit-tested).
import {
  chapterEdges,
  chaptersInView,
  getChapter,
  reaches,
  relatedLinks,
  viewIdOf,
  VIEWS,
  type ViewId,
} from "./curriculum";

export const NODE_W = 212;
export const NODE_H = 100;
export const GHOST_W = 196;
export const GHOST_H = 60;
const LAYER_GAP = 168;
const X_GAP = 268;

export type GhostRole = "buildsOn" | "leadsTo" | "related";
export interface LayoutNode {
  key: string; // chapter id for in-view nodes, "ghost:<role>:<id>" for ghosts
  chapterId: string;
  kind: "chapter" | "ghost";
  role?: GhostRole;
  layer: number; // -1 for ghosts
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LayoutEdge {
  key: string;
  from: string; // node key
  to: string; // node key
  kind: "prereq" | "related";
  /** chapter-level endpoints (for highlighting) */
  fromChapter: string;
  toChapter: string;
  d: string; // SVG path
  label?: { x: number; y: number; text: string };
  via: string[]; // skill edges that justify a prerequisite edge
  note?: string; // related-link explanation
}
export interface ViewLayout {
  viewId: ViewId;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  bounds: { x: number; y: number; w: number; h: number };
  /** in-view chapters with no in-view prerequisite */
  entryChapters: string[];
}

// ---------- cross-view edges (shared by both views so stubs are consistent) ----------
/**
 * For an edge X→Y crossing views, keep it unless
 *  (a) X also points into an in-view ancestor of Y (attach the stub to the earliest chapter), or
 *  (b) X reaches another external source Z that also points to Y (Z is the nearer prerequisite).
 */
export const crossViewEdges = (() => {
  const kept: typeof chapterEdges[number][] = [];
  for (const v of VIEWS) {
    const inV = (id: string) => viewIdOf(getChapter(id)) === v.id;
    const cand = chapterEdges.filter((e) => !inV(e.from) && inV(e.to));
    for (const e of cand) {
      const a = cand.some((f) => f.from === e.from && f.to !== e.to && reaches(f.to, e.to, inV));
      const b = cand.some((f) => f.to === e.to && f.from !== e.from && reaches(e.from, f.from));
      if (!a && !b) kept.push(e);
    }
  }
  return kept;
})();

function internalEdges(viewId: ViewId) {
  const ids = new Set(chaptersInView(viewId).map((c) => c.id));
  const inV = (id: string) => ids.has(id);
  const edges = chapterEdges.filter((e) => inV(e.from) && inV(e.to));
  // transitive reduction using in-view paths only
  return edges.filter((e) => !edges.some((f) => f.from === e.from && f.to !== e.to && (f.to === e.to || reaches(f.to, e.to, inV))));
}

const curveV = (x1: number, y1: number, x2: number, y2: number) => {
  const dy = Math.max(48, (y2 - y1) / 2);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
};
const curveH = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(60, Math.abs(x2 - x1) / 2);
  const s = x2 >= x1 ? 1 : -1;
  return `M ${x1} ${y1} C ${x1 + s * dx} ${y1}, ${x2 - s * dx} ${y2}, ${x2} ${y2}`;
};

function spread(items: { desired: number; set: (v: number) => void }[], gap: number) {
  items.sort((a, b) => a.desired - b.desired);
  const placed: number[] = [];
  for (const it of items) placed.push(placed.length ? Math.max(it.desired, placed[placed.length - 1]! + gap) : it.desired);
  // recentre so the group stays near its desired mean
  const shift = items.reduce((s, it, i) => s + (it.desired - placed[i]!), 0) / Math.max(1, items.length);
  items.forEach((it, i) => it.set(placed[i]! + shift));
}

const cache = new Map<ViewId, ViewLayout>();

export function layoutView(viewId: ViewId): ViewLayout {
  const hit = cache.get(viewId);
  if (hit) return hit;

  const chs = chaptersInView(viewId);
  const ids = new Set(chs.map((c) => c.id));
  const internal = internalEdges(viewId);

  // layers = longest in-view path from an in-view root
  const layer = new Map<string, number>();
  const visit = (id: string): number => {
    if (layer.has(id)) return layer.get(id)!;
    const preds = internal.filter((e) => e.to === id).map((e) => e.from);
    const l = preds.length ? Math.max(...preds.map(visit)) + 1 : 0;
    layer.set(id, l);
    return l;
  };
  chs.forEach((c) => visit(c.id));
  const maxLayer = Math.max(...layer.values());

  // x by barycentre of parents, then de-overlap within each layer
  const x = new Map<string, number>();
  for (let l = 0; l <= maxLayer; l++) {
    const row = chs.filter((c) => layer.get(c.id) === l);
    const items = row.map((c, i) => {
      const parents = internal.filter((e) => e.to === c.id).map((e) => x.get(e.from)!);
      const desired = parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : (i - (row.length - 1) / 2) * X_GAP;
      return { desired: desired + i * 0.001, set: (v: number) => x.set(c.id, v) };
    });
    spread(items, X_GAP);
  }

  const nodes: LayoutNode[] = chs.map((c) => ({
    key: c.id,
    chapterId: c.id,
    kind: "chapter",
    layer: layer.get(c.id)!,
    x: Math.round(x.get(c.id)! - NODE_W / 2),
    y: layer.get(c.id)! * LAYER_GAP,
    w: NODE_W,
    h: NODE_H,
  }));
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));

  const edges: LayoutEdge[] = internal.map((e) => {
    const a = byKey.get(e.from)!, b = byKey.get(e.to)!;
    return {
      key: `p:${e.from}>${e.to}`, from: e.from, to: e.to, kind: "prereq", fromChapter: e.from, toChapter: e.to,
      d: curveV(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y),
      via: e.via,
    };
  });

  // left column: cross-view prerequisites ("builds on") and successors ("leads to")
  const leftX = minX - GHOST_W - 104;
  const ghostSpecs: { key: string; chapterId: string; role: GhostRole; attach: string[] }[] = [];
  const addGhost = (role: GhostRole, chapterId: string, attach: string) => {
    const key = `ghost:${role}:${chapterId}`;
    const g = ghostSpecs.find((s) => s.key === key);
    if (g) g.attach.push(attach);
    else ghostSpecs.push({ key, chapterId, role, attach: [attach] });
  };
  const crossIn = crossViewEdges.filter((e) => ids.has(e.to));
  const crossOut = crossViewEdges.filter((e) => ids.has(e.from));
  crossIn.forEach((e) => addGhost("buildsOn", e.from, e.to));
  crossOut.forEach((e) => addGhost("leadsTo", e.to, e.from));
  // related links with exactly one end in this view → right column
  const relIn = relatedLinks.filter((l) => ids.has(l.a) !== ids.has(l.b));
  relIn.forEach((l) => addGhost("related", ids.has(l.a) ? l.b : l.a, ids.has(l.a) ? l.a : l.b));

  const left = ghostSpecs.filter((g) => g.role !== "related");
  const right = ghostSpecs.filter((g) => g.role === "related");
  const placeColumn = (specs: typeof ghostSpecs, colX: number) => {
    const items = specs.map((g) => {
      const ys = g.attach.map((a) => byKey.get(a)!.y + NODE_H / 2);
      const off = g.role === "buildsOn" ? -26 : g.role === "leadsTo" ? 26 : 0;
      const node: LayoutNode = { key: g.key, chapterId: g.chapterId, kind: "ghost", role: g.role, layer: -1, x: colX, y: 0, w: GHOST_W, h: GHOST_H };
      nodes.push(node);
      byKey.set(node.key, node);
      return { desired: ys.reduce((a, b) => a + b, 0) / ys.length + off - GHOST_H / 2, set: (v: number) => (node.y = Math.round(v)) };
    });
    spread(items, GHOST_H + 20);
  };
  placeColumn(left, leftX);
  placeColumn(right, maxX + 116);

  for (const e of crossIn) {
    const g = byKey.get(`ghost:buildsOn:${e.from}`)!, n = byKey.get(e.to)!;
    edges.push({ key: `p:${e.from}>${e.to}`, from: g.key, to: n.key, kind: "prereq", fromChapter: e.from, toChapter: e.to,
      d: curveH(g.x + g.w, g.y + g.h / 2, n.x, n.y + n.h * 0.36), via: e.via });
  }
  for (const e of crossOut) {
    const g = byKey.get(`ghost:leadsTo:${e.to}`)!, n = byKey.get(e.from)!;
    edges.push({ key: `p:${e.from}>${e.to}`, from: n.key, to: g.key, kind: "prereq", fromChapter: e.from, toChapter: e.to,
      d: curveH(n.x, n.y + n.h * 0.66, g.x + g.w, g.y + g.h / 2), via: e.via });
  }
  for (const l of relIn) {
    const inside = ids.has(l.a) ? l.a : l.b, other = inside === l.a ? l.b : l.a;
    const n = byKey.get(inside)!, g = byKey.get(`ghost:related:${other}`)!;
    const x1 = n.x + n.w, y1 = n.y + n.h / 2, x2 = g.x, y2 = g.y + g.h / 2;
    edges.push({ key: `r:${inside}~${other}`, from: n.key, to: g.key, kind: "related", fromChapter: inside, toChapter: other,
      d: curveH(x1, y1, x2, y2), label: { x: (x1 + x2) / 2, y: (y1 + y2) / 2, text: "related" }, via: [], note: l.note });
  }
  // related links with both ends in this view (none today, supported for completeness)
  for (const l of relatedLinks.filter((l) => ids.has(l.a) && ids.has(l.b))) {
    const a = byKey.get(l.a)!, b = byKey.get(l.b)!;
    const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x + b.w, y2 = b.y + b.h / 2;
    edges.push({ key: `r:${l.a}~${l.b}`, from: l.a, to: l.b, kind: "related", fromChapter: l.a, toChapter: l.b,
      d: `M ${x1} ${y1} C ${x1 + 90} ${y1}, ${x2 + 90} ${y2}, ${x2} ${y2}`, label: { x: Math.max(x1, x2) + 70, y: (y1 + y2) / 2, text: "related" }, via: [], note: l.note });
  }

  const pad = 72;
  const bx = Math.min(...nodes.map((n) => n.x)) - pad;
  const by = Math.min(...nodes.map((n) => n.y)) - pad;
  const bw = Math.max(...nodes.map((n) => n.x + n.w)) + pad - bx;
  const bh = Math.max(...nodes.map((n) => n.y + n.h)) + pad - by;

  const result: ViewLayout = {
    viewId,
    nodes,
    edges,
    bounds: { x: bx, y: by, w: bw, h: bh },
    entryChapters: chs.filter((c) => !internal.some((e) => e.to === c.id)).map((c) => c.id),
  };
  cache.set(viewId, result);
  return result;
}
