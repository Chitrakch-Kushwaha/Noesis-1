// Check specifications (plain JSON data, so they can cross into the checking worker) and results.
import type { DimensionName } from "./units";

export type CheckResult =
  | { status: "correct"; notes?: string[] }
  | { status: "incorrect"; tags: string[]; details?: Record<string, unknown> }
  | { status: "invalid"; reason: InvalidReason; message: string }
  | { status: "indeterminate"; reason: string; message: string };

export type InvalidReason =
  | "empty" | "too-long" | "unparseable" | "missing-unit" | "unknown-unit" | "not-exact" | "wrong-form"
  | "unknown-symbol" | "incomplete" | "not-allowed";

/** Only correct/incorrect consume an attempt (config: invalid and indeterminate never do). */
export const consumesAttempt = (r: CheckResult) => r.status === "correct" || r.status === "incorrect";

export interface BuggyValue { value: number; tags: string[] }
export interface Interval { lo: number; hi: number; loClosed: boolean; hiClosed: boolean }
export type SetElement = number | [number, number] | string;
export type Form = "factorised" | "simplified" | "no-negative-exponents" | "rationalised-denominator";
export interface DomainSpec { [variable: string]: [number, number] }

export type CheckSpec =
  | { kind: "single-choice"; correct: string; options: { id: string; tags?: string[] }[] }
  | { kind: "multi-choice"; correct: string[]; options: { id: string; tags?: string[] }[] }
  | {
      kind: "quantity";
      value: number; // SI
      dimension: DimensionName;
      tolerance: { relative?: number; absolute?: number };
      temperature?: "absolute" | "difference";
      requireUnit?: boolean;
      buggy?: BuggyValue[];
    }
  | { kind: "number"; value: number; exact?: boolean; tolerance?: { relative?: number; absolute?: number }; buggy?: BuggyValue[]; allowedFunctions?: string[] }
  | {
      kind: "expression";
      reference: string;
      variables: string[];
      domain: DomainSpec;
      specialPoints?: Record<string, number>[];
      domainMustMatch?: boolean;
      forms?: Form[];
      allowedFunctions?: string[];
      logBase?: "e" | "10";
      buggy?: { expression: string; tags: string[] }[];
    }
  | {
      kind: "antiderivative";
      integrand: string;
      reference?: string; // a known antiderivative
      variable: string;
      domain: DomainSpec;
      constants?: string[]; // symbols treated as the constant of integration (default ["C"])
      requireConstant?: boolean;
      logBase?: "e" | "10";
      buggy?: { expression: string; tags: string[] }[];
    }
  | { kind: "equation"; reference: string; variables: string[]; box: DomainSpec; buggy?: { equation: string; tags: string[] }[] }
  | { kind: "interval"; union: Interval[] }
  | { kind: "set"; elements: SetElement[]; buggy?: { elements: SetElement[]; tags: string[] }[] }
  | { kind: "ordering"; items: string[]; correct: string[]; ties?: string[][]; buggy?: { order: string[]; tags: string[] }[] }
  | {
      kind: "mapping";
      items: string[];
      targets: string[];
      accepted: Record<string, string[]>;
      rules?: { item: string; target: string; tags: string[] }[];
    }
  | { kind: "diagram"; rules: DiagramRules };

export interface DiagramForce { kind: string; agent: string; magnitude: number; angleDeg: number }
export interface DiagramRules {
  required: {
    kind: string;
    agent?: string;
    angleDeg?: number;
    angleTol?: number; // degrees, default 8
    magnitude?: number; // newtons
    magnitudeTol?: number; // relative, default 0.08
    missingTags: string[];
    wrongDirectionTags?: string[];
    wrongMagnitudeTags?: string[];
  }[];
  /** forces of these kinds must not appear (e.g. a push after contact has ended) */
  forbidden?: { kind: string; tags: string[] }[];
  /** a force whose agent is "none" (no agent) */
  noAgentTags?: string[];
  /** two forces of the same kind */
  duplicateTags?: string[];
}

/** Inputs per kind: text for typed answers; structured values for choice/order/mapping/diagram. */
export type CheckInput = string | string[] | Record<string, string> | DiagramForce[];
