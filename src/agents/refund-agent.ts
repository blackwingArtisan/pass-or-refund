/**
 * The refund agent. Its tools are bound to one enrollment, so it has no way to name another. It
 * checks the policy and proposes, and the Guard holds the proposal until a person decides. It
 * isn't in AGENTS, so only lib/course/refund.ts can start it, after the policy says one is due.
 */
import { appConfig } from "@/app.config";
import { defineAgent, type AgentDefinition, type AgentInput } from "@/lib/agent/define";
import { CHECK_REFUND_POLICY, checkRefundPolicy } from "./tools/check-refund-policy";
import { REFUND_COURSE_PURCHASE, refundCoursePurchase } from "./tools/refund-course-purchase";

export const REFUND_AGENT_GOAL: AgentInput = { goal: "A learner has failed the final check. Check the guarantee policy and, if a refund is due, propose it." };

/** Short pauses: the steps show on the timeline, but a person shouldn't wait on them. */
const PAUSE_MS = 250;

export const refundAgent = (enrollmentId: string): AgentDefinition =>
  defineAgent({
    id: "refund-agent",
    name: "Refund agent",
    description: "Checks the guarantee policy after a failed attempt and proposes a refund for a person to approve.",
    system: `You are the refund agent for Pass or Refund, an online course with a guarantee. You propose refunds. You never decide them: a person on the course team does.

1. Call ${CHECK_REFUND_POLICY}.
2. If eligible is true, call ${REFUND_COURSE_PURCHASE} once. The amount is exactly paid.value. Give two to four short reasons in plain English, using only the rules and attempts in the policy result. Mention the scores.
3. If eligible is false, do not call ${REFUND_COURSE_PURCHASE}. Say which rule failed.

${REFUND_COURSE_PURCHASE} pauses until a person decides. If they decline, or a tool refuses, do not propose again: say what happened and stop.`,
    tools: () => [checkRefundPolicy(enrollmentId), refundCoursePurchase(enrollmentId)],
    policy: appConfig.agentPolicy,
    effort: "low",
    maxTurns: 5,
    mockScript: () => [
      { say: "Checking the guarantee policy for this enrollment.", tool: CHECK_REFUND_POLICY, as: "policy", pauseMs: PAUSE_MS },
      {
        say: "The policy says a refund is due. Proposing the amount PayPal says was paid, then waiting for a person.",
        tool: REFUND_COURSE_PURCHASE,
        input: (results) => ({
          amount: results.policy.paid.value,
          reasons: [`Two completed failing attempts, scoring ${results.policy.attempts.map((a: { score: number }) => a.score).join(" and ")}.`, "No attempt tried to instruct the grader.", "This is the learner's first refund for this course."],
        }),
        pauseMs: PAUSE_MS,
      },
    ],
  });
