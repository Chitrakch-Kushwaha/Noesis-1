// Phase 4 solvers: Work, Energy and Power.
import { N, numeric, pick } from "./helpers";
import { G, rad, type Solver } from "./types";

const half = 0.5;
export const wep4: Record<string, Solver> = {
  "wep.dotFromAngle": numeric((p) => ({ ans: N(p, "A") * N(p, "B") * Math.cos(rad(N(p, "th"))), AB: N(p, "A") * N(p, "B") }),
    { ignoredAngle: (p) => N(p, "A") * N(p, "B"), usedSin: (p) => N(p, "A") * N(p, "B") * Math.sin(rad(N(p, "th"))) }),
  "wep.angleFromComponents": numeric((p) => {
    const ax = N(p, "ax"), ay = N(p, "ay"), bx = N(p, "bx"), by = N(p, "by");
    const dot = ax * bx + ay * by, ma = Math.hypot(ax, ay), mb = Math.hypot(bx, by);
    return { ans: (Math.acos(dot / (ma * mb)) * 180) / Math.PI, dot, ma, mb, cos: dot / (ma * mb), angA: (Math.atan2(ay, ax) * 180) / Math.PI, angB: (Math.atan2(by, bx) * 180) / Math.PI };
  }, { dotAsAngle: (p) => N(p, "ax") * N(p, "bx") + N(p, "ay") * N(p, "by") }),
  "wep.perpendicularK": numeric((p) => {
    const a = N(p, "a"), c = N(p, "c"), d = N(p, "d");
    // (a î + k ĵ)·(c î + d ĵ) = 0  →  k = −ac / d
    return { ans: (-a * c) / d, ac: a * c, magB: Math.hypot(c, d), angB: (Math.atan2(d, c) * 180) / Math.PI };
  }, { signLost: (p) => (N(p, "a") * N(p, "c")) / N(p, "d"), ratioInverted: (p) => (-N(p, "d")) / (N(p, "a") * N(p, "c")) }),
  "wep.normalWork": pick("zero", (p) => ({ W: N(p, "m") * G })),
  "wep.sledWork": numeric((p) => ({ ans: N(p, "F") * N(p, "d") * Math.cos(rad(N(p, "th"))), Fx: N(p, "F") * Math.cos(rad(N(p, "th"))) }),
    { ignoredAngle: (p) => N(p, "F") * N(p, "d"), usedSin: (p) => N(p, "F") * N(p, "d") * Math.sin(rad(N(p, "th"))) }),
  "wep.frictionWork": numeric((p) => { const f = N(p, "mu") * N(p, "m") * G; return { ans: -f * N(p, "d"), f, W: N(p, "m") * G }; },
    { signLost: (p) => N(p, "mu") * N(p, "m") * G * N(p, "d"), weightNotFriction: (p) => -N(p, "m") * G * N(p, "d") }),
  "wep.triangleWork": numeric((p) => ({ ans: half * N(p, "F0") * N(p, "x0") }), { rectangle: (p) => N(p, "F0") * N(p, "x0") }),
  "wep.springWorkBetween": numeric((p) => {
    const k = N(p, "k"), x1 = N(p, "x1") / 100, x2 = N(p, "x2") / 100;
    return { ans: half * k * (x2 * x2 - x1 * x1), xa: x1, xb: x2, F1: k * x1, F2: k * x2 };
  }, { differenceSquared: (p) => half * N(p, "k") * ((N(p, "x2") - N(p, "x1")) / 100) ** 2, missingHalf: (p) => N(p, "k") * ((N(p, "x2") / 100) ** 2 - (N(p, "x1") / 100) ** 2) }),
  "wep.piecewiseWork": numeric((p) => {
    const F = N(p, "F"), a = N(p, "a"), b = N(p, "b");
    return { ans: F * a + half * F * (b - a), rect: F * a, tri: half * F * (b - a) };
  }, { rectangleWhole: (p) => N(p, "F") * N(p, "b"), rectangleOnly: (p) => N(p, "F") * N(p, "a") }),
  "wep.kineticEnergy": numeric((p) => ({ ans: half * N(p, "m") * N(p, "v") ** 2 }), { missingHalf: (p) => N(p, "m") * N(p, "v") ** 2, notSquared: (p) => half * N(p, "m") * N(p, "v") }),
  "wep.speedFromWork": numeric((p) => ({ ans: Math.sqrt((2 * N(p, "F") * N(p, "d")) / N(p, "m")), W: N(p, "F") * N(p, "d") }),
    { missingTwo: (p) => Math.sqrt((N(p, "F") * N(p, "d")) / N(p, "m")), noRoot: (p) => (2 * N(p, "F") * N(p, "d")) / N(p, "m") }),
  "wep.brakingByWork": numeric((p) => ({ ans: N(p, "v") ** 2 / (2 * N(p, "mu") * G), ke: half * N(p, "v") ** 2 }),
    { missingTwo: (p) => N(p, "v") ** 2 / (N(p, "mu") * G), notSquared: (p) => N(p, "v") / (2 * N(p, "mu") * G) }),
  "wep.gravPE": numeric((p) => ({ ans: N(p, "m") * G * N(p, "h") }), { forgotG: (p) => N(p, "m") * N(p, "h") }),
  "wep.springPE": numeric((p) => { const x = N(p, "xcm") / 100; return { ans: half * N(p, "k") * x * x, x }; },
    { notConverted: (p) => half * N(p, "k") * N(p, "xcm") ** 2, missingHalf: (p) => N(p, "k") * (N(p, "xcm") / 100) ** 2 }),
  "wep.springLaunch": numeric((p) => { const x = N(p, "xcm") / 100, k = N(p, "k"), m = N(p, "m"); return { ans: x * Math.sqrt(k / m), x, E: half * k * x * x }; },
    { forgotRoot: (p) => (N(p, "xcm") / 100) * (N(p, "k") / N(p, "m")), missingHalfEnergy: (p) => (N(p, "xcm") / 100) * Math.sqrt((2 * N(p, "k")) / N(p, "m")) }),
  "wep.dropSpeed": numeric((p) => ({ ans: Math.sqrt(2 * G * N(p, "h")) }), { noRoot: (p) => 2 * G * N(p, "h"), missingTwo: (p) => Math.sqrt(G * N(p, "h")) }),
  "wep.swingSpeed": numeric((p) => {
    const L = N(p, "L"), th = rad(N(p, "th")), drop = L * (1 - Math.cos(th));
    return { ans: Math.sqrt(2 * G * drop), drop };
  }, { ignoredAngle: (p) => Math.sqrt(2 * G * N(p, "L")), usedCos: (p) => Math.sqrt(2 * G * N(p, "L") * Math.cos(rad(N(p, "th")))) }),
  "wep.loopBottomSpeed": numeric((p) => ({ ans: Math.sqrt(5 * G * N(p, "R")), top: Math.sqrt(G * N(p, "R")) }),
    { topCondition: (p) => Math.sqrt(G * N(p, "R")), zeroAtTop: (p) => Math.sqrt(4 * G * N(p, "R")) }),
  "wep.liftPower": numeric((p) => ({ ans: (N(p, "m") * G * N(p, "h")) / N(p, "t"), W: N(p, "m") * G * N(p, "h") }), { forgotG: (p) => (N(p, "m") * N(p, "h")) / N(p, "t") }),
  "wep.powerFv": numeric((p) => ({ ans: N(p, "F") * N(p, "v") }), { divided: (p) => N(p, "F") / N(p, "v") }),
  "wep.pumpPower": numeric((p) => {
    const V = N(p, "L") / 1000, mass = 1000 * V, h = N(p, "h"), t = N(p, "tmin") * 60;
    return { ans: (mass * G * h) / t, mass, t, W: mass * G * h };
  }, { minutesNotConverted: (p) => ((N(p, "L")) * G * N(p, "h")) / N(p, "tmin") }),
  "wep.inelasticConserved": pick("momentum", () => ({})),
  "wep.elasticSecond": numeric((p) => { const m1 = N(p, "m1"), m2 = N(p, "m2"), u = N(p, "u"); return { ans: (2 * m1 * u) / (m1 + m2), v1: ((m1 - m2) * u) / (m1 + m2) }; },
    { inelastic: (p) => (N(p, "m1") * N(p, "u")) / (N(p, "m1") + N(p, "m2")), sameSpeed: (p) => N(p, "u") }),
  "wep.keLoss": numeric((p) => {
    const m1 = N(p, "m1"), m2 = N(p, "m2"), u = N(p, "u"), v = (m1 * u) / (m1 + m2);
    return { ans: half * m1 * u * u - half * (m1 + m2) * v * v, v, k1: half * m1 * u * u, k2: half * (m1 + m2) * v * v };
  }, { finalKE: (p) => { const m1 = N(p, "m1"), m2 = N(p, "m2"), u = N(p, "u"), v = (m1 * u) / (m1 + m2); return half * (m1 + m2) * v * v; }, initialKE: (p) => half * N(p, "m1") * N(p, "u") ** 2 }),
};
