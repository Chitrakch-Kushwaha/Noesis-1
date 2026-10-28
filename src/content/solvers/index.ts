// Registry of reference solvers. Templates name a solver; the validator checks it exists.
import { concept, cur, maths, set, vec } from "./others";
import { kin, lom, mip } from "./physics11";
import type { Solver } from "./types";
import { kin4 } from "./kin";
import { lom4, mip4 } from "./mip";
import { wep4 } from "./wep";
import { osc4, rot4 } from "./rotosc";
import { f4 } from "./foundations";

export const SOLVERS: Record<string, Solver> = { ...kin, ...mip, ...lom, ...concept, ...cur, ...set, ...vec, ...maths, ...kin4, ...mip4, ...lom4, ...wep4, ...rot4, ...osc4, ...f4 };
export type { Solver } from "./types";
