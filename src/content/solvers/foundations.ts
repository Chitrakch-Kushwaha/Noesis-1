// Phase 4 solvers: foundation micro-skill practice (Class 9–10 and bridge material).
import { N, numeric, pick } from "./helpers";
import { rad, type Solver } from "./types";

export const f4: Record<string, Solver> = {
  "f.whichIrrational": pick("root", (p) => ({ n: N(p, "n") })),
  "f.numberLineDistance": numeric((p) => ({ ans: N(p, "b") + N(p, "a"), lo: -N(p, "a") }), { subtracted: (p) => Math.abs(N(p, "b") - N(p, "a")) }),
  "f.timeFromSpeed": numeric((p) => ({ ans: N(p, "d") / N(p, "v") }), { multiplied: (p) => N(p, "d") * N(p, "v"), inverted: (p) => N(p, "v") / N(p, "d") }),
  "f.speedFromDistance": numeric((p) => ({ ans: N(p, "d") / N(p, "t") }), { multiplied: (p) => N(p, "d") * N(p, "t") }),
  "f.slopeTwoPoints": numeric((p) => {
    const x1 = N(p, "x1"), y1 = N(p, "y1"), dx = N(p, "dx"), m = N(p, "m");
    return { ans: m, x2: x1 + dx, y2: y1 + m * dx, dy: m * dx, c: y1 - m * x1 };
  }, { runOverRise: (p) => 1 / N(p, "m") }),
  "f.steeper": pick((p) => (Math.abs(N(p, "m1")) > Math.abs(N(p, "m2")) ? "a" : "b"), (p) => ({ m1: N(p, "m1"), m2: N(p, "m2") })),
  "f.trapeziumUnderLine": numeric((p) => {
    const m = N(p, "m"), c = N(p, "c"), a = N(p, "a"), b = N(p, "b");
    const ya = m * a + c, yb = m * b + c;
    return { ans: 0.5 * (ya + yb) * (b - a), ya, yb, w: b - a };
  }, { endHeight: (p) => (N(p, "m") * N(p, "b") + N(p, "c")) * (N(p, "b") - N(p, "a")) }),
  "f.triangleArea": numeric((p) => ({ ans: 0.5 * N(p, "b") * N(p, "h") }), { noHalf: (p) => N(p, "b") * N(p, "h") }),
  "f.solveLinear": numeric((p) => ({ ans: (N(p, "c") - N(p, "b")) / N(p, "a"), cb: N(p, "c") - N(p, "b") }), { signSlip: (p) => (N(p, "c") + N(p, "b")) / N(p, "a"), orderSlip: (p) => N(p, "c") / N(p, "a") - N(p, "b") }),
  "f.subjectOfFormula": pick("ok", () => ({})),
  "f.largerRoot": numeric((p) => { const a = N(p, "p"), b = N(p, "q"); return { ans: Math.max(a, b), s: a + b, pr: a * b, small: Math.min(a, b) }; },
    { signSlip: (p) => -Math.min(N(p, "p"), N(p, "q")) }),
  "f.discriminant": numeric((p) => ({ ans: N(p, "b") ** 2 - 4 * N(p, "a") * N(p, "c") }),
    { plusSign: (p) => N(p, "b") ** 2 + 4 * N(p, "a") * N(p, "c"), notSquared: (p) => N(p, "b") - 4 * N(p, "a") * N(p, "c") }),
  "f.distanceTwoPoints": numeric((p) => ({ ans: Math.hypot(N(p, "dx"), N(p, "dy")), x2: N(p, "x1") + N(p, "dx"), y2: N(p, "y1") + N(p, "dy") }),
    { addedLegs: (p) => Math.abs(N(p, "dx")) + Math.abs(N(p, "dy")) }),
  "f.midpoint": numeric((p) => ({ ans: (N(p, "x1") + N(p, "x2")) / 2, my: (N(p, "y1") + N(p, "y2")) / 2 }), { halfDifference: (p) => (N(p, "x2") - N(p, "x1")) / 2 }),
  "f.thirdAngle": numeric((p) => ({ ans: 180 - N(p, "A") - N(p, "B") }), { fullTurn: (p) => 360 - N(p, "A") - N(p, "B") }),
  "f.alternateAngles": pick("equal", (p) => ({ x: N(p, "x"), y: 180 - N(p, "x") })),
  "f.hypotenuse": numeric((p) => ({ ans: Math.hypot(N(p, "a"), N(p, "b")), ang: (Math.atan2(N(p, "b"), N(p, "a")) * 180) / Math.PI }), { addedSides: (p) => N(p, "a") + N(p, "b") }),
  "f.missingLeg": numeric((p) => { const c = N(p, "c"), a = N(p, "a"); return { ans: Math.sqrt(c * c - a * a), ang: (Math.acos(a / c) * 180) / Math.PI }; },
    { addedSquares: (p) => Math.hypot(N(p, "c"), N(p, "a")) }),
  // the answer is checked in SI units (m); the question and its text use cm
  "f.arcLength": numeric((p) => ({ ans: (N(p, "r") / 100) * rad(N(p, "deg")), cm: N(p, "r") * rad(N(p, "deg")), thr: rad(N(p, "deg")) }), { degreesUsed: (p) => (N(p, "r") / 100) * N(p, "deg") }),
  "f.circleArea": numeric((p) => ({ ans: Math.PI * N(p, "r") ** 2, C: 2 * Math.PI * N(p, "r") }), { circumference: (p) => 2 * Math.PI * N(p, "r"), diameterSquared: (p) => Math.PI * (2 * N(p, "r")) ** 2 }),
  "f.unbalancedForce": pick("speeds", () => ({})),
  "f.massWeight": pick("mass", (p) => ({ m: N(p, "m") })),
  "f.workFd": numeric((p) => ({ ans: N(p, "F") * N(p, "d") }), { divided: (p) => N(p, "F") / N(p, "d") }),
  "f.fallingEnergy": pick("pe-ke", () => ({})),
  "f.cosFromSin": numeric((p) => ({ ans: Math.sqrt(1 - N(p, "s") ** 2), ang: (Math.asin(N(p, "s")) * 180) / Math.PI }), { oneMinus: (p) => 1 - N(p, "s"), noRoot: (p) => 1 - N(p, "s") ** 2 }),
  "f.standardValue": pick("half", () => ({})),
};
