// Phase 4 solvers: Motion in a Straight Line.
import { N, numeric, pick } from "./helpers";
import { G, type Solver } from "./types";

export const kin4: Record<string, Solver> = {
  "kin.netWalk": pick("net", (p) => ({ net: N(p, "a") - N(p, "b"), path: N(p, "a") + N(p, "b") })),
  "kin.pathLength": numeric((p) => {
    const x1 = N(p, "x1"), x2 = N(p, "x2"), x3 = N(p, "x3");
    return { ans: Math.abs(x2 - x1) + Math.abs(x3 - x2), disp: x3 - x1, out: Math.abs(x2 - x1), back: Math.abs(x3 - x2) };
  }, { displacementOnly: (p) => Math.abs(N(p, "x3") - N(p, "x1")), farthestOnly: (p) => Math.abs(N(p, "x2") - N(p, "x1")) }),
  "kin.signedDisplacement": numeric((p) => {
    const x1 = N(p, "x1"), x2 = N(p, "x2"), x3 = N(p, "x3");
    return { ans: x3 - x1, path: Math.abs(x2 - x1) + Math.abs(x3 - x2), d1: x2 - x1, d2: x3 - x2 };
  }, { pathLength: (p) => Math.abs(N(p, "x2") - N(p, "x1")) + Math.abs(N(p, "x3") - N(p, "x2")), signDropped: (p) => Math.abs(N(p, "x3") - N(p, "x1")), lastLegOnly: (p) => N(p, "x3") - N(p, "x2") }),
  "kin.averageSpeedUnits": numeric((p) => ({ ans: N(p, "d") / (N(p, "tmin") * 60), perMin: N(p, "d") / N(p, "tmin"), tsec: N(p, "tmin") * 60 }),
    { notConverted: (p) => N(p, "d") / N(p, "tmin") }),
  "kin.halvesAverage": numeric((p) => { const a = N(p, "v1"), b = N(p, "v2"); return { ans: (2 * a * b) / (a + b), mean: (a + b) / 2 }; },
    { arithmeticMean: (p) => (N(p, "v1") + N(p, "v2")) / 2 }),
  "kin.avgVelocityTwoLegs": numeric((p) => {
    const d1 = N(p, "d1"), d2 = N(p, "d2"), t1 = N(p, "t1"), t2 = N(p, "t2");
    return { ans: (d1 - d2) / (t1 + t2), net: d1 - d2, T: t1 + t2, speed: (d1 + d2) / (t1 + t2) };
  }, { speedNotVelocity: (p) => (N(p, "d1") + N(p, "d2")) / (N(p, "t1") + N(p, "t2")), meanOfVelocities: (p) => (N(p, "d1") / N(p, "t1") - N(p, "d2") / N(p, "t2")) / 2 }),
  "kin.xtNegativeSlope": pick("towards", (p) => ({ v: -N(p, "v") })),
  "kin.xtSlope": numeric((p) => {
    const x0 = N(p, "x0"), v = N(p, "v"), t1 = N(p, "t1"), t2 = N(p, "t2");
    return { ans: v, xa: x0 + v * t1, xb: x0 + v * t2, dx: v * (t2 - t1), dt: t2 - t1, top: Math.max(x0 + v * t2, x0) + 4 };
  }, { throughOrigin: (p) => (N(p, "x0") + N(p, "v") * N(p, "t2")) / N(p, "t2"), inverted: (p) => (N(p, "t2") - N(p, "t1")) / (N(p, "v") * (N(p, "t2") - N(p, "t1"))) }),
  "kin.xtTangent": numeric((p) => {
    const a = N(p, "a"), b = N(p, "b"), t1 = N(p, "t1");
    const x = (t: number) => a * t * t + b * t;
    return { ans: 2 * a * t1 + b, x1: x(t1), avg: x(t1) / t1, ymax: Math.ceil(x(5) + 2) };
  }, { averageFromStart: (p) => N(p, "a") * N(p, "t1") + N(p, "b"), positionInstead: (p) => N(p, "a") * N(p, "t1") ** 2 + N(p, "b") * N(p, "t1") }),
  "kin.accelSimple": numeric((p) => ({ ans: (N(p, "v") - N(p, "u")) / N(p, "t"), dv: N(p, "v") - N(p, "u") }),
    { finalOverTime: (p) => N(p, "v") / N(p, "t"), sumOverTime: (p) => (N(p, "v") + N(p, "u")) / N(p, "t") }),
  "kin.twoPhaseArea": numeric((p) => {
    const v = N(p, "v"), t1 = N(p, "t1"), t2 = N(p, "t2");
    return { ans: 0.5 * v * t1 + v * t2, tri: 0.5 * v * t1, rect: v * t2, T: t1 + t2, vmax: Math.ceil(v * 1.25) };
  }, { finalVelocityTimesTime: (p) => N(p, "v") * (N(p, "t1") + N(p, "t2")), rectangleOnly: (p) => N(p, "v") * N(p, "t2") }),
  "kin.vFromUat": numeric((p) => ({ ans: N(p, "u") + N(p, "a") * N(p, "t"), at: N(p, "a") * N(p, "t") }),
    { ignoresU: (p) => N(p, "a") * N(p, "t") }),
  "kin.reactionStop": numeric((p) => {
    const u = N(p, "u"), tr = N(p, "tr"), a = N(p, "a");
    return { ans: u * tr + (u * u) / (2 * a), react: u * tr, brake: (u * u) / (2 * a), T: tr + u / a, xmax: Math.ceil((u * tr + (u * u) / (2 * a)) * 1.3) };
  }, { brakingOnly: (p) => (N(p, "u") * N(p, "u")) / (2 * N(p, "a")), missingHalf: (p) => N(p, "u") * N(p, "tr") + (N(p, "u") * N(p, "u")) / N(p, "a") }),
  "kin.dropSpeed": numeric((p) => ({ ans: G * N(p, "t"), h: 0.5 * G * N(p, "t") ** 2 }),
    { distanceInstead: (p) => 0.5 * G * N(p, "t") ** 2 }),
  "kin.maxHeight": numeric((p) => ({ ans: (N(p, "u") ** 2) / (2 * G), tUp: N(p, "u") / G }),
    { missingHalf: (p) => (N(p, "u") ** 2) / G, timeInstead: (p) => N(p, "u") / G }),
  "kin.cliffThrow": numeric((p) => {
    const u = N(p, "u"), h = N(p, "h");
    return { ans: (u + Math.sqrt(u * u + 2 * G * h)) / G, up: (2 * u) / G, vEnd: Math.sqrt(u * u + 2 * G * h) };
  }, { ignoresCliff: (p) => (2 * N(p, "u")) / G, ignoresThrow: (p) => Math.sqrt((2 * N(p, "h")) / G) }),
  "kin.relativeSameDir": numeric((p) => ({ ans: N(p, "vA") - N(p, "vB") }), { added: (p) => N(p, "vA") + N(p, "vB") }),
  "kin.meetTime": numeric((p) => ({ ans: N(p, "d") / (N(p, "vA") + N(p, "vB")), closing: N(p, "vA") + N(p, "vB"), xMeet: (N(p, "vA") * N(p, "d")) / (N(p, "vA") + N(p, "vB")) }),
    { subtracted: (p) => N(p, "d") / Math.abs(N(p, "vA") - N(p, "vB")) }),
  "kin.overtake": numeric((p) => {
    const L1 = N(p, "L1"), L2 = N(p, "L2"), v1 = N(p, "v1"), v2 = N(p, "v2");
    return { ans: (L1 + L2) / (v1 - v2), rel: v1 - v2, Lsum: L1 + L2 };
  }, { oneLength: (p) => N(p, "L1") / (N(p, "v1") - N(p, "v2")), speedsAdded: (p) => (N(p, "L1") + N(p, "L2")) / (N(p, "v1") + N(p, "v2")) }),
};
