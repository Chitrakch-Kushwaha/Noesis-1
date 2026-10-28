import { describe, expect, it } from "vitest";
import type { CheckResult } from "@/src/checking/types";
import { attemptsLeft, initialPlayer, outcomeOf, playerReduce, tagsOf, type PlayerAction, type PlayerState } from "@/src/ui/player/playerModel";
import { foldCues } from "@/src/ui/player/useWidgetHost";
import { motionTrack } from "@/src/widgets/motion-track/model";
import { vectorBoard } from "@/src/widgets/vector-board/model";

const run = (...as: PlayerAction[]) => as.reduce<PlayerState>(playerReduce, initialPlayer());
const wrong = (tags: string[] = ["t"]): PlayerAction => ({ type: "result", input: "x", result: { status: "incorrect", tags } });
const right: PlayerAction = { type: "result", input: "y", result: { status: "correct" } };
const invalid: PlayerAction = { type: "result", input: "", result: { status: "invalid", reason: "missing-unit", message: "Add a unit." } };
const indeterminate: PlayerAction = { type: "result", input: "z", result: { status: "indeterminate", reason: "timeout", message: "Took too long." } as CheckResult };

describe("player state machine", () => {
  it("invalid and indeterminate results never use an attempt and are never counted as incorrect", () => {
    const s = run(invalid, indeterminate, invalid);
    expect(s.attempts).toHaveLength(0);
    expect(attemptsLeft(s)).toBe(3);
    expect(s.notice?.kind).toBe("invalid");
    expect(run(indeterminate).notice?.kind).toBe("indeterminate");
    expect(tagsOf(run(indeterminate))).toEqual([]);
  });
  it("three wrong answers exhaust the question", () => {
    const s = run(wrong(), invalid, wrong(["a"]), wrong(["a", "b"]));
    expect(s.phase).toBe("exhausted");
    expect(outcomeOf(s)).toBe("exhausted");
    expect(tagsOf(s)).toEqual(["t", "a", "b"]);
    expect(run(wrong(), wrong(), wrong(), right).phase).toBe("exhausted"); // no answers after the end
  });
  it("independent only when right first time with no hints", () => {
    expect(outcomeOf(run(right))).toBe("independent");
    expect(outcomeOf(run({ type: "hint" }, right))).toBe("assisted");
    expect(outcomeOf(run(wrong(), right))).toBe("assisted");
    expect(outcomeOf(run(invalid, right))).toBe("independent");
    expect(outcomeOf(run())).toBeNull();
  });
  it("hints are capped at three, and giving up ends the question as exhausted", () => {
    const s = run({ type: "hint" }, { type: "hint" }, { type: "hint" }, { type: "hint" });
    expect(s.hintsShown).toBe(3);
    const g = run({ type: "give-up" });
    expect(g.phase).toBe("exhausted");
    expect(g.gaveUp).toBe(true);
  });
  it("editing clears a notice", () => {
    expect(run(invalid, { type: "edit" }).notice).toBeNull();
  });
});

describe("cues drive the same deterministic model", () => {
  it("a solution step is the same state however you reach it", () => {
    const cfg = { scene: "floor" as const, body: { label: "box", mass: 2 }, predict: true, allowAdd: true, maxMagnitude: 30, vectors: [] };
    const s0 = vectorBoard.init(cfg as never);
    const steps = [[{ cue: "add-vector", args: { vector: { id: "W", kind: "weight", magnitude: 19.6, angleDeg: -90 } } }], [{ cue: "add-vector", args: { vector: { id: "N", kind: "normal", magnitude: 19.6, angleDeg: 90 } } }, { cue: "predict" }]];
    const a = foldCues(vectorBoard, foldCues(vectorBoard, s0, steps[0]!), steps[1]!);
    const b = foldCues(vectorBoard, s0, [...steps[0]!, ...steps[1]!]);
    expect(vectorBoard.describe(a as never, 1)).toBe(vectorBoard.describe(b as never, 1));
    expect(vectorBoard.describe(a as never, 1)).toMatch(/Resultant|zero/);
  });
  it("clear-overlay and reset are understood by every model", () => {
    const s0 = motionTrack.init({ mode: "1d", lanes: [{ id: "c", label: "Car", x0: 0, v0: 10, a: -2 }], stopAtRest: true } as never);
    const flagged = foldCues(motionTrack, s0, [{ cue: "flag", args: { x: 12 } }]);
    expect((flagged as { overlay: { flags: unknown[] } }).overlay.flags).toHaveLength(1);
    expect((foldCues(motionTrack, flagged, [{ cue: "clear-overlay" }]) as { overlay: { flags: unknown[] } }).overlay.flags).toHaveLength(0);
    expect(foldCues(motionTrack, flagged, [{ cue: "reset" }])).toEqual(s0);
  });
});
