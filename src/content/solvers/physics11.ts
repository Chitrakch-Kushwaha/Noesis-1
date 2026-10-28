// Solvers for Class 11 Physics templates (Motion in a Straight Line, Motion in a Plane, Laws of Motion).
import { rng } from "../rng";
import { G, num, rad, reject, type Solver } from "./types";

export const kin: Record<string, Solver> = {
  "kin.vtArea": {
    solve: (p) => {
      const u = num(p, "u"), t = num(p, "t"), v = u + 2 * num(p, "k");
      const s = ((u + v) / 2) * t;
      return { answer: { value: s }, derived: { v, s, rect: u * t, tri: ((v - u) * t) / 2, vmax: Math.ceil(v * 1.2), acc: (v - u) / t } };
    },
    buggy: {
      areaUsesFinalVelocity: (p) => (num(p, "u") + 2 * num(p, "k")) * num(p, "t"),
      areaIgnoresAcceleration: (p) => num(p, "u") * num(p, "t"),
      areaMissesRectangle: (p) => num(p, "k") * num(p, "t"),
      slopeInsteadOfArea: (p) => (2 * num(p, "k")) / num(p, "t"),
    },
  },
  "kin.brakingDistance": {
    solve: (p) => {
      const u = 2 * num(p, "k"), a = num(p, "a");
      const s = (u * u) / (2 * a), T = u / a;
      return { answer: { value: s }, derived: { u, s, T, half: u / 2, ghost: u * T, xmax: Math.ceil((u * T * 1.05) / 10) * 10 } };
    },
    buggy: {
      missingHalf: (p) => (4 * num(p, "k") ** 2) / num(p, "a"),
      droppedSquare: (p) => (2 * num(p, "k")) / (2 * num(p, "a")),
      timeInsteadOfDistance: (p) => (2 * num(p, "k")) / num(p, "a"),
    },
  },
};

export const mip: Record<string, Solver> = {
  "mip.projectileRange": {
    solve: (p) => {
      const v = num(p, "v"), th = rad(num(p, "ang"));
      const R = (v * v * Math.sin(2 * th)) / G;
      return { answer: { value: R }, derived: { R, tf: (2 * v * Math.sin(th)) / G, vx: v * Math.cos(th), vy: v * Math.sin(th), H: (v * v * Math.sin(th) ** 2) / (2 * G) } };
    },
    buggy: {
      forgotDoubleAngle: (p) => (num(p, "v") ** 2 * Math.sin(rad(num(p, "ang")))) / G,
      usedTimeToApex: (p) => (num(p, "v") ** 2 * Math.sin(rad(num(p, "ang"))) * Math.cos(rad(num(p, "ang")))) / G,
      ignoredHorizontalComponent: (p) => (2 * num(p, "v") ** 2 * Math.sin(rad(num(p, "ang")))) / G,
    },
  },
  "mip.perpendicularResultant": {
    solve: (p) => {
      const a = num(p, "a"), b = num(p, "b");
      const R = Math.hypot(a, b);
      return { answer: { value: R }, derived: { R, ang: (Math.atan2(b, a) * 180) / Math.PI, ss: a * a + b * b } };
    },
    buggy: { addedMagnitudes: (p) => num(p, "a") + num(p, "b"), subtractedMagnitudes: (p) => Math.abs(num(p, "a") - num(p, "b")) },
  },
  "mip.whichSide": { solve: (p) => ({ answer: { correct: "x" }, derived: { ang: num(p, "ang"), F: num(p, "F") } }) },
  "mip.xComponent": {
    solve: (p) => {
      const F = num(p, "F"), th = rad(num(p, "ang"));
      return { answer: { value: F * Math.cos(th) }, derived: { Fx: F * Math.cos(th), Fy: F * Math.sin(th), maxM: Math.ceil(F * 1.2) } };
    },
    buggy: { usedSin: (p) => num(p, "F") * Math.sin(rad(num(p, "ang"))), usedTan: (p) => num(p, "F") * Math.tan(rad(num(p, "ang"))) },
  },
  "mip.componentFromNorth": {
    // a force at alpha west of north, x positive east: Fx = −F sin α, Fy = F cos α
    solve: (p) => {
      const F = num(p, "F"), al = rad(num(p, "alpha"));
      const Fx = -F * Math.sin(al);
      return { answer: { value: Fx }, derived: { Fx, Fy: F * Math.cos(al), angStd: 90 + num(p, "alpha"), mag: F * Math.sin(al), maxM: Math.ceil(F * 1.2) } };
    },
    buggy: {
      signDropped: (p) => num(p, "F") * Math.sin(rad(num(p, "alpha"))),
      usedCos: (p) => -num(p, "F") * Math.cos(rad(num(p, "alpha"))),
      usedTan: (p) => -num(p, "F") * Math.tan(rad(num(p, "alpha"))),
    },
  },
};

export const lom: Record<string, Solver> = {
  "lom.afterPush": {
    solve: (p) => {
      const m = num(p, "m"), v0 = num(p, "v0"), mu = num(p, "mu");
      const W = m * G, f = mu * m * G, T = Math.min(1.5, v0 / (mu * G));
      return { answer: { correct: "a" }, derived: { W, f, T, push: Math.round(f * 1.5) } };
    },
  },
  "lom.thirdLaw": {
    solve: (p) => ({ answer: { correct: ["a", "b"] }, derived: { W: num(p, "m") * G } }),
  },
  "lom.frictionIncline": {
    solve: (p) => {
      const m = num(p, "m"), th = rad(num(p, "theta")), mu = num(p, "muS");
      const W = m * G, N = W * Math.cos(th), f = W * Math.sin(th), fmax = mu * N;
      return { answer: { value: f }, derived: { W, N, f, fmax, angN: 90 + num(p, "theta"), angDown: num(p, "theta") + 180 } };
    },
    buggy: {
      muTimesNormal: (p) => num(p, "muS") * num(p, "m") * G * Math.cos(rad(num(p, "theta"))),
      muTimesWeight: (p) => num(p, "muS") * num(p, "m") * G,
      weightCosTheta: (p) => num(p, "m") * G * Math.cos(rad(num(p, "theta"))),
    },
  },
  "lom.connectedAgents": {
    solve: (p) => {
      const mA = num(p, "mA"), mB = num(p, "mB"), F = num(p, "F");
      const a = F / (mA + mB), T = mA * a;
      return { answer: {}, derived: { a, T, WA: mA * G } };
    },
  },
  "lom.rankAccelerations": {
    solve: (p) => {
      const r = rng(num(p, "k"));
      const ids = ["P", "Q", "R", "S"];
      for (let tries = 0; tries < 400; tries++) {
        const m = ids.map(() => r.int(1, 5));
        const F = ids.map(() => 2 * r.int(1, 6));
        const a = ids.map((_, i) => F[i]! / m[i]!);
        if (new Set(a.map((x) => x.toFixed(6))).size < 4 || new Set(F).size < 4) continue;
        const byA = [...ids].sort((x, y) => a[ids.indexOf(y)]! - a[ids.indexOf(x)]!);
        const byF = [...ids].sort((x, y) => F[ids.indexOf(y)]! - F[ids.indexOf(x)]!);
        if (byA.join() === byF.join()) continue;
        const derived: Record<string, unknown> = { order: byA.join(" > ") };
        ids.forEach((id, i) => { derived[`F${id}`] = F[i]; derived[`m${id}`] = m[i]; derived[`a${id}`] = a[i]; });
        return { answer: { correct: byA }, derived };
      }
      return reject();
    },
    buggy: {
      byForce: (p) => {
        const s = lom["lom.rankAccelerations"]!.solve(p).derived!;
        return ["P", "Q", "R", "S"].sort((x, y) => Number(s[`F${y}`]) - Number(s[`F${x}`]));
      },
      byLightest: (p) => {
        const s = lom["lom.rankAccelerations"]!.solve(p).derived!;
        const order = ["P", "Q", "R", "S"].sort((x, y) => Number(s[`m${x}`]) - Number(s[`m${y}`]));
        return new Set(order.map((id) => s[`m${id}`])).size === 4 ? order : null;
      },
    },
  },
  "lom.fbdRope": {
    solve: (p) => {
      const m = num(p, "m"), T = num(p, "T"), ang = num(p, "ang");
      const W = m * G, f = T * Math.cos(rad(ang)), N = W - T * Math.sin(rad(ang));
      if (N <= 1) return reject();
      const required = [
        { kind: "weight", agent: "Earth", angleDeg: -90, magnitude: W, magnitudeTol: 0.08, missingTags: ["missing-weight"], wrongMagnitudeTags: ["weight-magnitude"] },
        { kind: "normal", agent: "floor", angleDeg: 90, magnitude: N, magnitudeTol: 0.1, missingTags: ["missing-normal"], wrongDirectionTags: ["normal-direction"], wrongMagnitudeTags: ["normal-equals-weight"] },
        { kind: "tension", agent: "rope", angleDeg: ang, magnitude: T, magnitudeTol: 0.08, missingTags: ["missing-tension"], wrongDirectionTags: ["tension-direction"] },
        { kind: "friction", agent: "floor", angleDeg: 180, magnitude: f, magnitudeTol: 0.1, missingTags: ["missing-friction"], wrongDirectionTags: ["friction-direction"], wrongMagnitudeTags: ["constant-velocity-unbalanced"] },
      ];
      const correctVectors = required.map((r) => ({ kind: r.kind, label: r.kind, agent: r.agent, magnitude: r.magnitude, angleDeg: r.angleDeg }));
      return {
        answer: {
          rules: {
            required,
            forbidden: [{ kind: "motion", tags: ["extra-force-of-motion"] }, { kind: "applied", tags: ["extra-force-of-motion"] }],
            noAgentTags: ["extra-force-of-motion"],
            duplicateTags: ["double-counted-force"],
          },
        },
        derived: { W, f, N, correctVectors, maxF: Math.ceil(Math.max(W, T) * 1.3) },
      };
    },
  },
  // ---------------------------------------------------------------- Phase 3 pilot additions
  "lom.weightAlongSlope": {
    solve: (p) => {
      const W = num(p, "W"), th = rad(num(p, "theta"));
      return { answer: { value: W * Math.sin(th) }, derived: { along: W * Math.sin(th), perp: W * Math.cos(th), angN: 90 + num(p, "theta"), maxM: W + 6 } };
    },
    buggy: { usedCos: (p) => num(p, "W") * Math.cos(rad(num(p, "theta"))), wholeWeight: (p) => num(p, "W") },
  },
  "lom.pushedUpIncline": {
    solve: (p) => {
      const m = num(p, "m"), th = num(p, "theta");
      const W = m * G, N = W * Math.cos(rad(th)), P = W * Math.sin(rad(th));
      const required = [
        { kind: "weight", agent: "Earth", angleDeg: -90, magnitude: W, magnitudeTol: 0.08, missingTags: ["missing-weight"], wrongMagnitudeTags: ["weight-magnitude"] },
        { kind: "normal", agent: "plank", angleDeg: 90 + th, magnitude: N, magnitudeTol: 0.1, missingTags: ["missing-normal"], wrongDirectionTags: ["normal-direction"], wrongMagnitudeTags: ["normal-equals-weight"] },
        { kind: "applied", agent: "hand", angleDeg: th, magnitude: P, magnitudeTol: 0.1, missingTags: ["missing-push"], wrongDirectionTags: ["push-direction"], wrongMagnitudeTags: ["constant-velocity-unbalanced"] },
      ];
      return {
        answer: { rules: { required, forbidden: [{ kind: "motion", tags: ["extra-force-of-motion"] }], noAgentTags: ["extra-force-of-motion"], duplicateTags: ["double-counted-force"] } },
        derived: { W, N, P, angN: 90 + th, maxF: Math.ceil(W * 1.3) },
      };
    },
  },
  "lom.horizontalHold": {
    solve: (p) => {
      const m = num(p, "m"), th = rad(num(p, "theta")), W = m * G;
      const F = W * Math.tan(th);
      return { answer: { value: F }, derived: { W, F, N: W / Math.cos(th), along: W * Math.sin(th), angN: 90 + num(p, "theta"), maxM: Math.ceil(Math.max(W / Math.cos(th), F) * 1.15) } };
    },
    buggy: {
      treatedAsParallel: (p) => num(p, "m") * G * Math.sin(rad(num(p, "theta"))),
      usedCos: (p) => num(p, "m") * G * Math.cos(rad(num(p, "theta"))),
      invertedTan: (p) => (num(p, "m") * G) / Math.tan(rad(num(p, "theta"))),
    },
  },
  "lom.recoil": {
    solve: (p) => {
      const mb = num(p, "mb") / 1000, vb = num(p, "vb"), M = num(p, "M");
      const V = (mb * vb) / M;
      return { answer: { value: V }, derived: { V, pb: mb * vb, mbkg: mb, negV: -V, xmax: Math.ceil(vb * 0.6) } };
    },
    buggy: {
      sameSpeed: (p) => num(p, "vb"),
      momentumNotVelocity: (p) => (num(p, "mb") / 1000) * num(p, "vb"),
      ratioInverted: (p) => (num(p, "M") * num(p, "vb")) / (num(p, "mb") / 1000),
    },
  },
  "lom.cartsStick": {
    solve: (p) => {
      const m1 = num(p, "m1"), u1 = num(p, "u1"), m2 = num(p, "m2");
      const v = (m1 * u1) / (m1 + m2);
      return { answer: { value: v }, derived: { v, p1: m1 * u1, M: m1 + m2 } };
    },
    buggy: {
      averagedVelocities: (p) => num(p, "u1") / 2,
      velocityUnchanged: (p) => num(p, "u1"),
      onlyOtherMass: (p) => (num(p, "m1") * num(p, "u1")) / num(p, "m2"),
    },
  },
  "lom.headOn": {
    solve: (p) => {
      const m1 = num(p, "m1"), u1 = num(p, "u1"), m2 = num(p, "m2"), u2 = -num(p, "u2s");
      const v = (m1 * u1 + m2 * u2) / (m1 + m2);
      if (Math.abs(v) < 0.05) return reject();
      return { answer: { value: v }, derived: { v, p1: m1 * u1, p2: m2 * u2, ptot: m1 * u1 + m2 * u2, M: m1 + m2, u2, absU2: -u2, dir: v > 0 ? "right" : "left" } };
    },
    buggy: {
      directionIgnored: (p) => (num(p, "m1") * num(p, "u1") + num(p, "m2") * num(p, "u2s")) / (num(p, "m1") + num(p, "m2")),
      averagedVelocities: (p) => (num(p, "u1") - num(p, "u2s")) / 2,
    },
  },
  "lom.centripetalSource": { solve: () => ({ answer: { correct: "friction" }, derived: {} }) },
  "lom.levelRoadMaxSpeed": {
    solve: (p) => {
      const mu = num(p, "mu"), r = num(p, "r");
      const v = Math.sqrt(mu * G * r);
      return { answer: { value: v }, derived: { v, v2: mu * G * r, kmh: v * 3.6, W: 1000 * G, f: mu * 1000 * G } };
    },
    buggy: { forgotRoot: (p) => num(p, "mu") * G * num(p, "r"), ignoredFriction: (p) => Math.sqrt(G * num(p, "r")) },
  },
  "lom.bankedSpeed": {
    solve: (p) => {
      const r = num(p, "r"), th = rad(num(p, "theta"));
      const v = Math.sqrt(r * G * Math.tan(th));
      return { answer: { value: v }, derived: { v, v2: r * G * Math.tan(th), tanv: Math.tan(th), angN: 90 + num(p, "theta"), W: 1000 * G, Nm: (1000 * G) / Math.cos(th), Nh: 1000 * G * Math.tan(th) } };
    },
    buggy: {
      usedSin: (p) => Math.sqrt(num(p, "r") * G * Math.sin(rad(num(p, "theta")))),
      invertedTan: (p) => Math.sqrt((num(p, "r") * G) / Math.tan(rad(num(p, "theta")))),
      forgotRoot: (p) => num(p, "r") * G * Math.tan(rad(num(p, "theta"))),
    },
  },
  "lom.noNetForce": { solve: (p) => ({ answer: { correct: "zero" }, derived: { m: num(p, "m"), v: num(p, "v"), W: num(p, "m") * G } }) },
  "lom.accelerationFromForce": {
    solve: (p) => {
      const F = num(p, "F"), m = num(p, "m");
      return { answer: { value: F / m }, derived: { a: F / m, maxM: F + 4 } };
    },
    buggy: { multiplied: (p) => num(p, "F") * num(p, "m"), inverted: (p) => num(p, "m") / num(p, "F") },
  },
  "lom.thirdLawPair": { solve: (p) => ({ answer: { correct: "earth" }, derived: { W: num(p, "m") * G } }) },
  "lom.fbdSliding": {
    solve: (p) => {
      const m = num(p, "m"), mu = num(p, "mu"), W = m * G, f = mu * W;
      const required = [
        { kind: "weight", agent: "Earth", angleDeg: -90, magnitude: W, magnitudeTol: 0.1, missingTags: ["missing-weight"], wrongMagnitudeTags: ["weight-magnitude"] },
        { kind: "normal", agent: "floor", angleDeg: 90, magnitude: W, magnitudeTol: 0.1, missingTags: ["missing-normal"], wrongDirectionTags: ["normal-direction"] },
        { kind: "friction", agent: "floor", angleDeg: 180, magnitude: f, magnitudeTol: 0.15, missingTags: ["missing-friction"], wrongDirectionTags: ["friction-direction-opposes-force"] },
      ];
      return {
        answer: { rules: { required, forbidden: [{ kind: "motion", tags: ["extra-force-of-motion"] }, { kind: "applied", tags: ["extra-force-of-motion"] }], noAgentTags: ["extra-force-of-motion"], duplicateTags: ["double-counted-force"] } },
        derived: { W, f, maxF: Math.ceil(W * 1.3) },
      };
    },
  },
  "lom.fbdRestingIncline": {
    solve: (p) => {
      const m = num(p, "m"), th = num(p, "theta"), W = m * G, N = W * Math.cos(rad(th)), f = W * Math.sin(rad(th));
      const required = [
        { kind: "weight", agent: "Earth", angleDeg: -90, magnitude: W, magnitudeTol: 0.1, missingTags: ["missing-weight"], wrongMagnitudeTags: ["weight-magnitude"] },
        { kind: "normal", agent: "plank", angleDeg: 90 + th, magnitude: N, magnitudeTol: 0.1, missingTags: ["missing-normal"], wrongDirectionTags: ["normal-direction"], wrongMagnitudeTags: ["normal-equals-weight"] },
        { kind: "friction", agent: "plank", angleDeg: th, magnitude: f, magnitudeTol: 0.12, missingTags: ["missing-friction"], wrongDirectionTags: ["friction-direction-opposes-force"], wrongMagnitudeTags: ["static-friction-always-max"] },
      ];
      return {
        answer: { rules: { required, forbidden: [{ kind: "motion", tags: ["extra-force-of-motion"] }], noAgentTags: ["extra-force-of-motion"], duplicateTags: ["double-counted-force"] } },
        derived: { W, N, f, angN: 90 + th, maxF: Math.ceil(W * 1.3) },
      };
    },
  },
  "lom.pairAcceleration": {
    solve: (p) => {
      const F = num(p, "F"), m1 = num(p, "m1"), m2 = num(p, "m2");
      return { answer: { value: F / (m1 + m2) }, derived: { a: F / (m1 + m2), M: m1 + m2, T: (m2 * F) / (m1 + m2), maxM: F + 4 } };
    },
    buggy: { onlyPulledMass: (p) => num(p, "F") / num(p, "m1"), addedNotDivided: (p) => num(p, "F") * (num(p, "m1") + num(p, "m2")) },
  },
  "lom.draggedConstantSpeed": {
    solve: (p) => {
      const m = num(p, "m"), mu = num(p, "mu");
      return { answer: { value: mu * m * G }, derived: { W: m * G, T: mu * m * G, maxM: Math.ceil(m * G * 1.2) } };
    },
    buggy: { massNotWeight: (p) => num(p, "mu") * num(p, "m"), tensionEqualsWeight: (p) => num(p, "m") * G },
  },
  "lom.bounceImpulse": {
    solve: (p) => {
      const m = num(p, "m") / 1000, u = num(p, "u"), v = num(p, "v");
      return { answer: { value: m * (u + v) }, derived: { J: m * (u + v), mkg: m, pin: m * u, pout: m * v } };
    },
    buggy: { directionIgnored: (p) => (num(p, "m") / 1000) * Math.abs(num(p, "v") - num(p, "u")), oneVelocity: (p) => (num(p, "m") / 1000) * num(p, "u") },
  },
  "lom.truckAndCar": {
    solve: (p) => {
      const F = num(p, "F"), M = num(p, "M"), m = num(p, "m");
      return { answer: { value: F }, derived: { ac: F / m, at: F / M } };
    },
    buggy: { scaledByMass: (p) => (num(p, "F") * num(p, "m")) / num(p, "M"), cancelled: () => 0 },
  },
  "lom.atwood": {
    solve: (p) => {
      const m1 = num(p, "m1"), m2 = num(p, "m2");
      const a = ((m1 - m2) * G) / (m1 + m2);
      return { answer: { value: a }, derived: { a, T: (2 * m1 * m2 * G) / (m1 + m2), W1: m1 * G, W2: m2 * G, dW: (m1 - m2) * G, M: m1 + m2 } };
    },
    buggy: { onlyHeavyMass: (p) => ((num(p, "m1") - num(p, "m2")) * G) / num(p, "m1"), freeFall: () => G },
  },
};
