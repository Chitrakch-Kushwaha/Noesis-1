// Phase 4 solvers: System of Particles and Rotational Motion; Oscillations.
import { N, numeric, pick } from "./helpers";
import { G, rad, type Solver } from "./types";

const TAU = 2 * Math.PI;
export const rot4: Record<string, Solver> = {
  "rot.comTwo": numeric((p) => { const m1 = N(p, "m1"), m2 = N(p, "m2"), d = N(p, "d"); return { ans: (m2 * d) / (m1 + m2), mid: d / 2 }; },
    { midpoint: (p) => N(p, "d") / 2, fromWrongEnd: (p) => (N(p, "m1") * N(p, "d")) / (N(p, "m1") + N(p, "m2")) }),
  "rot.comThree": numeric((p) => {
    const ms = [N(p, "m1"), N(p, "m2"), N(p, "m3")], ys = [0, 0, N(p, "h")], xs = [0, N(p, "b"), N(p, "c")];
    const M = ms[0]! + ms[1]! + ms[2]!;
    return { ans: (ms[2]! * ys[2]!) / M, M, xc: (ms[1]! * xs[1]! + ms[2]! * xs[2]!) / M, plain: ys[2]! / 3 };
  }, { unweighted: (p) => N(p, "h") / 3 }),
  "rot.boat": numeric((p) => { const m = N(p, "m"), M = N(p, "M"), d = N(p, "d"); return { ans: (m * d) / (m + M), shore: (M * d) / (m + M) }; },
    { sameDistance: (p) => N(p, "d"), massRatioOnly: (p) => (N(p, "m") * N(p, "d")) / N(p, "M") }),
  "rot.ixj": pick("k", () => ({})),
  "rot.crossMagnitude": numeric((p) => ({ ans: N(p, "A") * N(p, "B") * Math.sin(rad(N(p, "th"))) }),
    { usedCos: (p) => N(p, "A") * N(p, "B") * Math.cos(rad(N(p, "th"))), ignoredAngle: (p) => N(p, "A") * N(p, "B") }),
  "rot.crossZ": numeric((p) => ({ ans: N(p, "a1") * N(p, "b2") - N(p, "a2") * N(p, "b1") }),
    { dotInstead: (p) => N(p, "a1") * N(p, "b1") + N(p, "a2") * N(p, "b2"), orderSwapped: (p) => N(p, "a2") * N(p, "b1") - N(p, "a1") * N(p, "b2") }),
  "rot.rpmToRad": numeric((p) => ({ ans: (TAU * N(p, "rpm")) / 60, rps: N(p, "rpm") / 60 }),
    { revNotRadians: (p) => N(p, "rpm") / 60, minutesKept: (p) => TAU * N(p, "rpm") }),
  "rot.revsFromRest": numeric((p) => { const th = 0.5 * N(p, "alpha") * N(p, "t") ** 2; return { ans: th / TAU, theta: th }; },
    { radiansNotRevs: (p) => 0.5 * N(p, "alpha") * N(p, "t") ** 2, missingHalf: (p) => (N(p, "alpha") * N(p, "t") ** 2) / TAU }),
  "rot.fanStop": numeric((p) => { const w = N(p, "w0"), th = TAU * N(p, "n"); return { ans: (w * w) / (2 * th), theta: th }; },
    { revsNotConverted: (p) => (N(p, "w0") ** 2) / (2 * N(p, "n")), missingTwo: (p) => (N(p, "w0") ** 2) / (TAU * N(p, "n")) }),
  "rot.torque": numeric((p) => ({ ans: N(p, "F") * N(p, "r") }), { divided: (p) => N(p, "F") / N(p, "r") }),
  "rot.seesaw": numeric((p) => ({ ans: (N(p, "m1") * N(p, "d1")) / N(p, "m2"), tau: N(p, "m1") * G * N(p, "d1"), W1: N(p, "m1") * G, W2: N(p, "m2") * G }),
    { inverted: (p) => (N(p, "m2") * N(p, "d1")) / N(p, "m1"), sameDistance: (p) => N(p, "d1") }),
  "rot.beamBalance": numeric((p) => {
    const L = N(p, "L"), pv = N(p, "pv"), Wb = N(p, "Wb");
    return { ans: (Wb * (L / 2 - pv)) / pv, arm: L / 2 - pv, half: L / 2 };
  }, { halfLengthArm: (p) => (N(p, "Wb") * (N(p, "L") / 2)) / N(p, "pv"), beamIgnored: () => 0 }),
  "rot.discI": numeric((p) => ({ ans: 0.5 * N(p, "M") * N(p, "R") ** 2 }), { ringFormula: (p) => N(p, "M") * N(p, "R") ** 2 }),
  "rot.gyrationRod": numeric((p) => ({ ans: N(p, "L") / Math.sqrt(12), I: (N(p, "M") * N(p, "L") ** 2) / 12 }),
    { forgotRoot: (p) => N(p, "L") / 12, halfLength: (p) => N(p, "L") / 2 }),
  "rot.pointMassesI": numeric((p) => {
    const m1 = N(p, "m1"), m2 = N(p, "m2"), L = N(p, "L"), a = N(p, "a");
    return { ans: m1 * a * a + m2 * (L - a) ** 2, b: L - a };
  }, { notSquared: (p) => N(p, "m1") * N(p, "a") + N(p, "m2") * (N(p, "L") - N(p, "a")), comDistance: (p) => (N(p, "m1") + N(p, "m2")) * (N(p, "L") / 2) ** 2 }),
  "rot.alpha": numeric((p) => ({ ans: N(p, "tau") / N(p, "I") }), { multiplied: (p) => N(p, "tau") * N(p, "I") }),
  "rot.discKE": numeric((p) => { const I = 0.5 * N(p, "M") * N(p, "R") ** 2; return { ans: 0.5 * I * N(p, "w") ** 2, I }; },
    { missingHalf: (p) => 0.5 * N(p, "M") * N(p, "R") ** 2 * N(p, "w") ** 2 }),
  "rot.pulleyMass": numeric((p) => { const m = N(p, "m"), M = N(p, "M"); return { ans: (m * G) / (m + M / 2), T: (m * G * (M / 2)) / (m + M / 2) }; },
    { freeFall: () => G, ringPulley: (p) => (N(p, "m") * G) / (N(p, "m") + N(p, "M")) }),
  "rot.angularMomentum": numeric((p) => ({ ans: N(p, "I") * N(p, "w") }), { keInstead: (p) => 0.5 * N(p, "I") * N(p, "w") ** 2, divided: (p) => N(p, "I") / N(p, "w") }),
  "rot.skater": numeric((p) => ({ ans: (N(p, "I1") * N(p, "w1")) / N(p, "I2") }), { inverted: (p) => (N(p, "I2") * N(p, "w1")) / N(p, "I1") }),
  "rot.discDrop": numeric((p) => {
    const I1 = 0.5 * N(p, "M1") * N(p, "R") ** 2, I2 = 0.5 * N(p, "M2") * N(p, "R") ** 2, w = N(p, "w1");
    return { ans: (I1 * w) / (I1 + I2), I1, I2 };
  }, { averaged: (p) => N(p, "w1") / 2, keConserved: (p) => { const I1 = N(p, "M1"), I2 = N(p, "M2"); return N(p, "w1") * Math.sqrt(I1 / (I1 + I2)); } }),
};

export const osc4: Record<string, Solver> = {
  "osc.frequency": numeric((p) => ({ ans: 1 / N(p, "T") }), { periodInstead: (p) => N(p, "T") }),
  "osc.periodFromCount": numeric((p) => ({ ans: N(p, "t") / N(p, "n"), f: N(p, "n") / N(p, "t") }), { frequencyInstead: (p) => N(p, "n") / N(p, "t") }),
  "osc.inPhaseAgain": numeric((p) => { const a = N(p, "T1"), b = N(p, "T2"); return { ans: (a * b) / (b - a), n: b / (b - a) }; },
    { differenceOnly: (p) => N(p, "T2") - N(p, "T1"), product: (p) => N(p, "T1") * N(p, "T2") }),
  "osc.x0": numeric((p) => ({ ans: N(p, "A") * Math.cos(rad(N(p, "phi"))) }), { usedSin: (p) => N(p, "A") * Math.sin(rad(N(p, "phi"))), amplitude: (p) => N(p, "A") }),
  "osc.xAtTime": numeric((p) => ({ ans: N(p, "A") * Math.cos((TAU * N(p, "t")) / N(p, "T")), phase: (360 * N(p, "t")) / N(p, "T") }),
    { missing2pi: (p) => N(p, "A") * Math.cos(N(p, "t") / N(p, "T")) }),
  "osc.phaseFromStart": numeric((p) => ({ ans: (Math.acos(N(p, "frac")) * 180) / Math.PI }),
    { arcsin: (p) => (Math.asin(N(p, "frac")) * 180) / Math.PI, directionIgnored: (p) => (-Math.acos(N(p, "frac")) * 180) / Math.PI }),
  "osc.vmax": numeric((p) => { const w = TAU / N(p, "T"); return { ans: N(p, "A") * w, w }; }, { amaxInstead: (p) => N(p, "A") * (TAU / N(p, "T")) ** 2 }),
  "osc.speedAtX": numeric((p) => { const w = TAU / N(p, "T"), A = N(p, "A"), x = N(p, "x"); return { ans: w * Math.sqrt(A * A - x * x), w }; },
    { omegaX: (p) => (TAU / N(p, "T")) * N(p, "x"), linear: (p) => (TAU / N(p, "T")) * (N(p, "A") - N(p, "x")) }),
  "osc.amax": numeric((p) => { const w = TAU * N(p, "f"); return { ans: N(p, "A") * w * w, w }; },
    { vmaxInstead: (p) => N(p, "A") * TAU * N(p, "f"), forgot2pi: (p) => N(p, "A") * N(p, "f") ** 2 }),
  "osc.springForce": numeric((p) => ({ ans: N(p, "k") * N(p, "xcm") / 100, x: N(p, "xcm") / 100 }), { notConverted: (p) => N(p, "k") * N(p, "xcm") }),
  "osc.springPeriod": numeric((p) => ({ ans: TAU * Math.sqrt(N(p, "m") / N(p, "k")), w: Math.sqrt(N(p, "k") / N(p, "m")) }),
    { inverted: (p) => TAU * Math.sqrt(N(p, "k") / N(p, "m")), forgot2pi: (p) => Math.sqrt(N(p, "m") / N(p, "k")) }),
  "osc.parallelSprings": numeric((p) => ({ ans: TAU * Math.sqrt(N(p, "m") / (2 * N(p, "k"))), keff: 2 * N(p, "k") }),
    { seriesFormula: (p) => TAU * Math.sqrt(N(p, "m") / (N(p, "k") / 2)), singleSpring: (p) => TAU * Math.sqrt(N(p, "m") / N(p, "k")) }),
  "osc.totalEnergy": numeric((p) => { const A = N(p, "Acm") / 100; return { ans: 0.5 * N(p, "k") * A * A, A }; },
    { missingHalf: (p) => N(p, "k") * (N(p, "Acm") / 100) ** 2, notSquared: (p) => 0.5 * N(p, "k") * (N(p, "Acm") / 100) }),
  "osc.keAtX": numeric((p) => { const A = N(p, "Acm") / 100, x = N(p, "xcm") / 100; return { ans: 0.5 * N(p, "k") * (A * A - x * x), A, x, E: 0.5 * N(p, "k") * A * A, U: 0.5 * N(p, "k") * x * x }; },
    { peInstead: (p) => 0.5 * N(p, "k") * (N(p, "xcm") / 100) ** 2 }),
  "osc.equalEnergies": numeric((p) => ({ ans: N(p, "Acm") / 100 / Math.SQRT2, A: N(p, "Acm") / 100 }), { halfAmplitude: (p) => N(p, "Acm") / 200 }),
  "osc.pendulumPeriod": numeric((p) => ({ ans: TAU * Math.sqrt(N(p, "L") / G) }), { inverted: (p) => TAU * Math.sqrt(G / N(p, "L")), noRoot: (p) => (TAU * N(p, "L")) / G }),
  "osc.pendulumLength": numeric((p) => ({ ans: (G * N(p, "T") ** 2) / (4 * Math.PI ** 2) }), { notSquared: (p) => (G * N(p, "T")) / TAU }),
  "osc.moonPendulum": numeric((p) => ({ ans: N(p, "T") * Math.sqrt(N(p, "k")) }), { inverted: (p) => N(p, "T") / Math.sqrt(N(p, "k")), linear: (p) => N(p, "T") * N(p, "k") }),
};
