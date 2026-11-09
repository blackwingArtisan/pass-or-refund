import type { TimelineStep } from "@/lib/events/types";

/** Code's line for a run whose money call a person approved. */
export const approvedLine = (by = "a person") => `Approved by ${by} before the refund ran. Only then did PayPal pay it.`;

/**
 * The steps a learner sees behind their enrollment: PayPal's calls and the guarded steps, never the
 * agent's own words. The agent's messages and reasoning are dropped (the learner reads the
 * code-checked note on their refund card instead), and a finished run says only what code knows: who
 * approved its money call, if a person did. A pending approval shows as a plain step, since the
 * learner can't decide it.
 */
export function learnerSteps(steps: TimelineStep[]): TimelineStep[] {
  const approvedIn = (runId?: string) => steps.find((s) => s.approval?.state === "approved" && s.runId === runId)?.approval;
  return steps.flatMap((s): TimelineStep[] => {
    if (s.kind === "agent.message" || s.kind === "agent.thinking") return [];
    if (s.kind === "run" && s.status === "succeeded") {
      const approval = approvedIn(s.runId);
      return [{ ...s, detail: approval ? approvedLine(approval.decidedBy) : undefined }];
    }
    return [s.approval?.state === "pending" ? { ...s, approval: undefined } : s];
  });
}
