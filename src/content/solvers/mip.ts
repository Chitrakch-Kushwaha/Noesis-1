// Phase 4 solvers: Motion in a Plane, plus the remaining Laws of Motion gaps.
import { N, numeric, pick } from "./helpers";
import { G, rad, type Solver } from "./types";

export const mip4: Record<string, Solver> = {
  "mip.whichVector": pick("disp", () => ({})),
  "mip.scaledMagnitude": numeric((p) => ({ ans: Math.abs(N(p, "k")) * N(p, "A"), angK: N(p, "k") < 0 ? 225 : 45 }),
    { signedMagnitude: (p) => N(p, "k") * N(p, "A") }),
  "mip.unitVectorX": numeric((p) => { const x = N(p, "ax"), y = N(p, "ay"), m = Math.hypot(x, y); return { ans: x / m, mag: m, uy: y / m, ang: (Math.atan2(y, x) * 180) / Math.PI }; },
    { notNormalised: (p) => N(p, "ax"), normalisedBySum: (p) => N(p, "ax") / (Math.abs(N(p, "ax")) + Math.abs(N(p, "ay"))) }),
  "mip.oppositeResultant": numeric((p) => ({ ans: Math.abs(N(p, "a") - N(p, "b")), sum: N(p, "a") + N(p, "b") }),
    { added: (p) => N(p, "a") + N(p, "b") }),
  "mip.resultantAtAngle": numeric((p) => {
    const a = N(p, "a"), b = N(p, "b"), th = rad(N(p, "th"));
    const R = Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(th));
    return { ans: R, cos: Math.cos(th), dir: (Math.atan2(b * Math.sin(th), a + b * Math.cos(th)) * 180) / Math.PI };
  }, { perpendicularFormula: (p) => Math.hypot(N(p, "a"), N(p, "b")), cosineSign: (p) => Math.sqrt(Math.max(0, N(p, "a") ** 2 + N(p, "b") ** 2 - 2 * N(p, "a") * N(p, "b") * Math.cos(rad(N(p, "th"))))) }),
  "mip.speedFromComponents": numeric((p) => ({ ans: Math.hypot(N(p, "vx"), N(p, "vy")), ang: (Math.atan2(N(p, "vy"), N(p, "vx")) * 180) / Math.PI }),
    { added: (p) => N(p, "vx") + N(p, "vy") }),
  "mip.distanceAccelerated": numeric((p) => {
    const a = N(p, "a"), v = N(p, "v"), t = N(p, "t"), x = 0.5 * a * t * t, y = v * t;
    return { ans: Math.hypot(x, y), x, y, ang: (Math.atan2(y, x) * 180) / Math.PI };
  }, { missingHalf: (p) => Math.hypot(N(p, "a") * N(p, "t") ** 2, N(p, "v") * N(p, "t")), componentsAdded: (p) => 0.5 * N(p, "a") * N(p, "t") ** 2 + N(p, "v") * N(p, "t") }),
  "mip.riverDrift": numeric((p) => ({ ans: (N(p, "vr") * N(p, "w")) / N(p, "vb"), t: N(p, "w") / N(p, "vb"), speed: Math.hypot(N(p, "vr"), N(p, "vb")) }),
    { ratioInverted: (p) => (N(p, "vb") * N(p, "w")) / N(p, "vr"), resultantSpeed: (p) => (Math.hypot(N(p, "vr"), N(p, "vb")) * N(p, "w")) / N(p, "vb") }),
  "mip.velocityAtTop": pick("horizontal", (p) => ({ ux: N(p, "u") * Math.cos(rad(N(p, "ang"))) })),
  "mip.horizontalLaunch": numeric((p) => {
    const u = N(p, "u"), h = N(p, "h"), t = Math.sqrt((2 * h) / G);
    return { ans: u * t, t };
  }, { forgotRoot: (p) => (N(p, "u") * 2 * N(p, "h")) / G, rangeFormula: (p) => (N(p, "u") ** 2) / G }),
  "mip.centripetal": numeric((p) => ({ ans: (N(p, "v") ** 2) / N(p, "r"), w: N(p, "v") / N(p, "r") }),
    { vOverR: (p) => N(p, "v") / N(p, "r"), vSquaredTimesR: (p) => N(p, "v") ** 2 * N(p, "r") }),
  "mip.centripetalFromPeriod": numeric((p) => { const r = N(p, "r"), T = N(p, "T"); return { ans: (4 * Math.PI ** 2 * r) / (T * T), v: (2 * Math.PI * r) / T, w: (2 * Math.PI) / T }; },
    { speedInstead: (p) => (2 * Math.PI * N(p, "r")) / N(p, "T") }),
  "mip.centripetalScaling": numeric((p) => ({ ans: N(p, "kv") ** 2 / N(p, "kr") }),
    { linearInV: (p) => N(p, "kv") / N(p, "kr"), ignoredRadius: (p) => N(p, "kv") ** 2 }),
};

export const lom4: Record<string, Solver> = {
  "lom.stringBreaks": pick("tangent", () => ({})),
  "lom.lampTwoStrings": numeric((p) => {
    const W = N(p, "m") * G, th = rad(N(p, "th"));
    return { ans: W / (2 * Math.cos(th)), W, half: W / 2, angL: 90 + N(p, "th"), angR: 90 - N(p, "th"), maxF: Math.ceil(W / Math.cos(th)) };
  }, { ignoresAngle: (p) => (N(p, "m") * G) / 2, usedSin: (p) => (N(p, "m") * G) / (2 * Math.sin(rad(N(p, "th")))) }),
};
