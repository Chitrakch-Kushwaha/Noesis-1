import { describe, expect, it } from "vitest";
import { chapterEdges, chapters, chaptersInView, getChapter, prerequisiteDetails, relatedLinks, VIEWS, viewIdOf } from "@/src/domain/curriculum";
import { crossViewEdges, layoutView } from "@/src/domain/roadmapLayout";

describe("corrected curriculum (Phase 0 review)", () => {
  it("has 24 chapters, six per view, with the renamed derivatives chapter", () => {
    expect(chapters).toHaveLength(24);
    for (const v of VIEWS) expect(chaptersInView(v.id)).toHaveLength(6);
    expect(getChapter("aod").title).toBe("Applications of Derivatives");
    expect(getChapter("vec").title).toBe("Vector Algebra");
  });
  it("no longer has Oscillations → EMI as a prerequisite, only as a related link", () => {
    expect(chapterEdges.some((e) => e.from === "osc" && e.to === "emi")).toBe(false);
    expect(relatedLinks.some((l) => [l.a, l.b].sort().join() === "emi,osc")).toBe(true);
  });
  it("justifies Rotation → Electric Charges by dipole torque only", () => {
    const e = chapterEdges.find((x) => x.from === "rot" && x.to === "ecf")!;
    expect(e.via).toEqual(["rot.torque-equilibrium → ecf.dipole-torque"]);
  });
  it("routes Current Electricity through Electrostatic Potential", () => {
    expect(chapterEdges.find((x) => x.from === "epc" && x.to === "cur")?.via).toEqual(["epc.potential → cur.emf"]);
    expect(prerequisiteDetails("cur").map((p) => p.chapterId).sort()).toEqual(["ecf", "epc", "wep"]);
  });
  it("never has an Integrals–WEP relation", () => {
    expect(relatedLinks.some((l) => [l.a, l.b].sort().join() === "int,wep")).toBe(false);
    expect(chapterEdges.some((e) => (e.from === "int" && e.to === "wep") || (e.from === "wep" && e.to === "int"))).toBe(false);
  });
});

describe("roadmap layout per view", () => {
  for (const v of VIEWS) {
    describe(v.label, () => {
      const L = layoutView(v.id);
      const chapterNodes = L.nodes.filter((n) => n.kind === "chapter");
      it("places exactly the view's six chapters", () => {
        expect(chapterNodes.map((n) => n.chapterId).sort()).toEqual(chaptersInView(v.id).map((c) => c.id).sort());
      });
      it("has no overlapping nodes", () => {
        for (let i = 0; i < L.nodes.length; i++)
          for (let j = i + 1; j < L.nodes.length; j++) {
            const a = L.nodes[i]!, b = L.nodes[j]!;
            const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            expect(overlap, `${a.key} overlaps ${b.key}`).toBe(false);
          }
      });
      it("draws in-view prerequisite edges downward (prerequisite above the chapter that needs it)", () => {
        const byKey = new Map(L.nodes.map((n) => [n.key, n]));
        for (const e of L.edges.filter((e) => e.kind === "prereq" && byKey.get(e.from)!.kind === "chapter" && byKey.get(e.to)!.kind === "chapter"))
          expect(byKey.get(e.to)!.layer).toBeGreaterThan(byKey.get(e.from)!.layer);
      });
      it("uses ghost nodes only for chapters in other views", () => {
        for (const g of L.nodes.filter((n) => n.kind === "ghost")) expect(viewIdOf(getChapter(g.chapterId))).not.toBe(v.id);
      });
      it("labels every related connector 'related' and never gives it skill links", () => {
        for (const e of L.edges.filter((e) => e.kind === "related")) {
          expect(e.label?.text).toBe("related");
          expect(e.via).toEqual([]);
        }
      });
      it("only draws prerequisite edges that exist in the derived graph", () => {
        for (const e of L.edges.filter((e) => e.kind === "prereq"))
          expect(chapterEdges.some((x) => x.from === e.fromChapter && x.to === e.toChapter)).toBe(true);
      });
      it("is deterministic", () => expect(layoutView(v.id)).toBe(L));
    });
  }
  it("shows each cross-view prerequisite in both views (builds on / leads to)", () => {
    for (const e of crossViewEdges) {
      const inTarget = layoutView(viewIdOf(getChapter(e.to))).nodes.some((n) => n.key === `ghost:buildsOn:${e.from}`);
      const inSource = layoutView(viewIdOf(getChapter(e.from))).nodes.some((n) => n.key === `ghost:leadsTo:${e.to}`);
      expect(inTarget && inSource, `${e.from}→${e.to}`).toBe(true);
    }
  });
  it("matches the expected branch structure", () => {
    const internal = (v: (typeof VIEWS)[number]["id"]) =>
      layoutView(v).edges.filter((e) => e.kind === "prereq" && !e.from.startsWith("ghost") && !e.to.startsWith("ghost")).map((e) => `${e.fromChapter}>${e.toChapter}`).sort();
    expect(internal("physics11")).toEqual(["kin>mip", "lom>wep", "mip>lom", "wep>osc", "wep>rot"]);
    expect(internal("physics12")).toEqual(["cur>mcm", "ecf>epc", "epc>cur", "mcm>emi"]);
    expect(internal("maths11")).toEqual(["rel>trg", "set>rel", "sl>con", "trg>lim", "trg>sl"]);
    expect(internal("maths12")).toEqual(["cnd>aod", "cnd>int", "int>aoi", "vec>tdg"]);
    expect(crossViewEdges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(["con>aoi", "lim>cnd", "rot>ecf", "set>aod", "sl>tdg", "trg>vec"]);
  });
});
