import { describe, expect, it } from "vitest";
import { approvedLine, learnerSteps } from "@/lib/course/learner-steps";
import type { TimelineStep } from "@/lib/events/types";

let n = 0;
const step = (s: Partial<TimelineStep> & Pick<TimelineStep, "kind" | "title">): TimelineStep =>
  ({ id: `e${n}`, stepId: `s${n}`, ts: "", channel: "enrollment:en_1", status: "info", startedAt: `2026-11-09T20:00:${String(n++).padStart(2, "0")}Z`, updatedAt: "", history: [], ...s }) as TimelineStep;

/** The hosted take's refund run, in timeline order: the run, the proposal, the approved refund, and the model's wrong closing words. */
const hostedRun = () => {
  n = 0;
  return [
    step({ kind: "run", title: "Refund agent finished", status: "succeeded", runId: "run_a", detail: "The tool went through without pausing for a person's approval." }),
    step({ kind: "agent.message", title: "Refund agent", runId: "run_a", detail: "The policy says a refund is due. Proposing it for a person to approve." }),
    step({ kind: "tool", title: "Refund $49.00 to Jordan Lee", status: "succeeded", runId: "run_a", approval: { id: "ap_1", state: "approved", decidedBy: "course team" } }),
    step({ kind: "agent.thinking", title: "Reasoning", runId: "run_a", detail: "It seems no approval was needed." }),
    step({ kind: "agent.message", title: "Refund agent", runId: "run_a", detail: "The tool went through without pausing for a person's approval, even though the guard notes said refunds above 49.00 need one." }),
    step({ kind: "tool", title: "Refund capture", status: "succeeded", runId: undefined }),
  ];
};

describe("what the learner's page shows from the refund agent", () => {
  it("shows nothing the agent wrote after a person approved the refund, and code's approval line for the run", () => {
    const shown = learnerSteps(hostedRun());
    const text = JSON.stringify(shown);
    expect(text).not.toContain("without pausing");
    expect(text).not.toContain("no approval was needed");
    expect(shown.find((s) => s.kind === "run")!.detail).toBe(approvedLine("course team"));
    expect(approvedLine("course team")).toBe("Approved by course team before the refund ran. Only then did PayPal pay it.");
    // None of the agent's own words reach the learner, before the approval or after it.
    expect(shown.filter((s) => s.kind === "agent.message" || s.kind === "agent.thinking")).toEqual([]);
    // Steps from outside the run are untouched.
    expect(shown.at(-1)!.title).toBe("Refund capture");
  });

  it("shows a pending approval as a plain step, and a finished run nobody approved without the model's summary", () => {
    const pending = hostedRun().map((s) => (s.approval ? { ...s, status: "awaiting_approval" as const, approval: { ...s.approval, state: "pending" as const } } : s));
    const shown = learnerSteps(pending);
    expect(shown.map((s) => s.kind)).toEqual(["run", "tool", "tool"]);
    expect(shown.some((s) => s.approval)).toBe(false);
    expect(shown[0].detail).toBeUndefined();
  });
});
