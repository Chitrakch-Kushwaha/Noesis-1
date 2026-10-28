// Phase 4 content: golden answers (independently computed), new widget models, the extended
// pipeline checks and chapter coverage. Nothing here approves content.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coverage } from "@/scripts/content/coverage";
import { loadTemplateFiles, validateAll } from "@/scripts/content/lib";
import { CATALOG } from "@/src/content/catalog";
import { LESSONS } from "@/src/content/lessons";
import { SOLVERS } from "@/src/content/solvers";
import { validateTemplate } from "@/src/content/validate";
import { WIDGETS } from "@/src/widgets/registry";
import { solved } from "@/src/widgets/circuit-board/model";
import { equipotentialContours, fieldAt, particleOf } from "@/src/widgets/field-map/model";
import { imageDistance, prismDeviation, refract, twoLensImage } from "@/src/widgets/ray-diagram/model";

const goldenDir = join(__dirname, "..", "..", "content", "golden");
const cases = readdirSync(goldenDir).filter((f) => f.startsWith("phase4-")).flatMap((f) =>
  (JSON.parse(readFileSync(join(goldenDir, f), "utf8")) as { cases: { solver: string; params: Record<string, number | string>; expect?: number; expectChoice?: string; template: string }[] }).cases);

describe("Phase 4 golden answers (separately computed in Python, not by the solvers)", () => {
  it("has golden cases", () => expect(cases.length).toBeGreaterThan(0));
  for (const c of cases) {
    it(`${c.template} ${JSON.stringify(c.params)}`, () => {
      const a = SOLVERS[c.solver]!.solve(c.params).answer;
      if (c.expectChoice !== undefined) expect(a.correct).toBe(c.expectChoice);
      else expect(Math.abs((a.value as number) - c.expect!)).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(c.expect!) * 1e-6));
    });
  }
});

describe("extended content checks catch broken templates", () => {
  const files = loadTemplateFiles();
  const raw = (id: string) => structuredClone(files.find((f) => f.raw.id === id)!.raw);
  const errs = (r: Record<string, unknown>) => validateTemplate(r, { seeds: [1, 2, 3] }).issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.message}`).join("\n");
  it("impossible parameters", () => {
    const r = raw("kin.relative-1d.h.overtake");
    r.constraints = ["v1 < 0"];
    expect(errs(r)).toMatch(/can never be instantiated/);
  });
  it("inconsistent units between the answer and its example or answer text", () => {
    const r = raw("kin.free-fall.m.max-height");
    (r.input as { placeholder: string }).placeholder = "for example 10 s";
    expect(errs(r)).toMatch(/example answer's unit/);
    const r2 = raw("kin.free-fall.m.max-height");
    r2.answerText = "{{ans}} m/s";
    expect(errs(r2)).toMatch(/answer text's unit/);
  });
  it("duplicate wording across templates", () => {
    const run = validateAll(files.concat([{ ...files.find((f) => f.raw.id === "kin.suvat.e.v-from-uat")!, raw: { ...raw("kin.suvat.e.v-from-uat"), id: "kin.suvat.e.v-from-uat-copy" } }]));
    expect(run.issues.some((i) => i.message.includes("Same wording as"))).toBe(true);
  });
});

describe("coverage report", () => {
  it("labels every chapter honestly and never reports the ship rule as met without approvals", () => {
    const run = validateAll();
    const rows = coverage(run.manifest, LESSONS);
    expect(rows).toHaveLength(24);
    for (const r of rows) {
      expect(["preview", "partial", "practice", "ready"]).toContain(r.readiness);
      if (CATALOG.every((e) => !e.countsTowardMastery)) expect(r.readiness).not.toBe("ready");
      if (r.readiness === "practice") for (const s of r.skills.filter((x) => x.required)) for (const d of ["easy", "medium", "hard"] as const) expect(s.counts[d].playable).toBeGreaterThan(0);
    }
  });
});

describe("Phase 4 widget models are physically consistent", () => {
  it("circuit board: MNA conserves current and honours battery terminal orientation", () => {
    const cb = WIDGETS["circuit-board"]!;
    const state = cb.init({ nodes: [{ id: "n", x: 0, y: 0 }, { id: "p", x: 1, y: 0 }], ground: "n", elements: [
      { id: "bat", kind: "battery", from: "n", to: "p", value: 12 }, { id: "r1", kind: "resistor", from: "p", to: "n", value: 6 }, { id: "r2", kind: "resistor", from: "p", to: "n", value: 6 },
    ] });
    const q = solved(state);
    expect(q.V("p")).toBeCloseTo(12);
    expect(q.element.get("r1")!.current).toBeCloseTo(2);
    expect(q.element.get("r2")!.current).toBeCloseTo(2);
    // Battery current is defined from its negative `from` terminal to its positive `to` terminal.
    expect(q.element.get("bat")!.current).toBeCloseTo(4);
  });
  it("field map: charged-particle radius, fields and equipotentials agree with the model", () => {
    expect(particleOf({ q: 2, m: 3, v: 4, B: 5 }).r).toBeCloseTo(1.2); // r = mv/qB
    const charges = [{ q: 1e-9, x: -0.2, y: 0.1 }, { q: -1e-9, x: 0.3, y: -0.1 }];
    const cs = equipotentialContours(charges, 1);
    expect(cs.length).toBeGreaterThan(10);
    const s = cs[0]!;
    // Both endpoints lie on the same sampled potential level, within grid interpolation error.
    expect(Math.abs(fieldAt(charges, s.x1, s.y1).V - fieldAt(charges, s.x2, s.y2).V)).toBeLessThan(100);
  });
  it("ray diagram: lens formula, refraction/TIR, prism and two-lens combination are signed", () => {
    expect(imageDistance(-30, 15)).toBeCloseTo(30); // 1/v − 1/u = 1/f
    expect(imageDistance(-30, -15)).toBeCloseTo(-10); // concave mirror
    expect(refract(1.5, 1, 50).tir).toBe(true);
    expect(refract(1, 1.5, 30).refractedDeg).toBeCloseTo(19.4712206, 6);
    expect(prismDeviation(60, 1.5).minimumDeg).toBeCloseTo(37.1807558, 6);
    expect(twoLensImage(-30, 15, 50, 20)).toMatchObject({ firstV: 30, secondU: -20, secondV: Infinity });
  });
  it("rigid body: lever torque balance, rotor kinematics, centre of mass, dipole and coil", () => {
    const rb = WIDGETS["rigid-body"]!;
    const lever = rb.init({ mode: "lever", lever: { length: 2, pivot: 1, loads: [{ id: "a", label: "A", x: 0.2, force: 30 }, { id: "b", label: "B", x: 1.6, force: 50, editable: true }] } });
    expect(rb.describe(lever, 0)).toMatch(/clockwise/);
    // 30 N × 0.8 m anticlockwise balances 40 N × 0.6 m clockwise
    const balanced = rb.reduce(lever, { type: "set-load", id: "b", x: 1.6, force: 40 });
    expect(rb.describe(balanced, 0)).toMatch(/balances/);
    const rotor = rb.init({ mode: "rotor", rotor: { shape: "disc", mass: 2, size: 0.5, torque: 1, omega0: 0, duration: 2 } });
    // I = ½MR² = 0.25; α = 4; ω(2) = 8 rad/s
    expect(rb.describe(rotor, 2)).toMatch(/ω = 8 rad\/s/);
    const com = rb.init({ mode: "com", com: { masses: [{ id: "a", label: "A", m: 1, x: 0 }, { id: "b", label: "B", m: 3, x: 4 }] } });
    expect(rb.describe(com, 0)).toMatch(/\(3, 0\)/);
    const dip = rb.init({ mode: "dipole", dipole: { kind: "electric", moment: 2e-9, field: 1e4, angleDeg: 30 } });
    expect(rb.describe(dip, 0)).toMatch(/Torque 0.00001 N m/);
    const coil = rb.init({ mode: "coil", coil: { turns: 100, area: 0.01, field: 0.5, omega: 100 } });
    expect(rb.describe(coil, 0)).toMatch(/peak 50 V/);
  });
  it("oscillator: period from k and m, energy conserved, pendulum period from L and g", () => {
    const os = WIDGETS.oscillator!;
    const s = os.init({ system: "spring", mass: 1, k: 4 * Math.PI ** 2, amplitude: 0.1 });
    expect(os.describe(s, 0)).toMatch(/Period 1 s/);
    const totals = [0, 0.13, 0.4, 0.77].map((t) => os.describe(s, t).match(/total ([\d.e-]+) J/)![1]);
    expect(new Set(totals).size).toBe(1);
    const p = os.init({ system: "pendulum", length: 9.8 / (4 * Math.PI ** 2), amplitude: 0.05 });
    expect(os.describe(p, 0)).toMatch(/Period 1 s/);
  });
});
