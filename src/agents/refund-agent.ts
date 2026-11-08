/**
 * The refund agent. Its tools are bound to one enrollment, so it has no way to name another. It
 * checks the policy and proposes, and the Guard holds the proposal until a person decides. It
 * isn't in AGENTS, so only lib/course/refund.ts can start it, after the policy says one is due.
 */
import { appConfig } from "@/app.config";
import { defineAgent, type AgentDefinition, type AgentInput, type ScriptStep } from "@/lib/agent/define";
import { assertNoMockOutage } from "@/lib/ai/mock-outage";
import type { Enrollment } from "@/lib/course/types";
import { ACCEPT_DISPUTE_CLAIM, acceptCourseDispute } from "./tools/accept-course-dispute";
import { CHECK_REFUND_POLICY, checkRefundPolicy } from "./tools/check-refund-policy";
import { REFUND_COURSE_PURCHASE, refundCoursePurchase } from "./tools/refund-course-purchase";

export const REFUND_AGENT_GOAL: AgentInput = { goal: "A learner has failed the final check. Check the guarantee policy and, if a refund is due, propose it." };

/** Short pauses: the steps show on the timeline, but a person shouldn't wait on them. */
const PAUSE_MS = 250;

const scores = (policy: { attempts: { score: number }[] }) => policy.attempts.map((a) => a.score).join(" and ");

const reasonsFrom = (policy: { attempts: { score: number }[] }, closing: string[]) => [`Two completed failing attempts, scoring ${scores(policy)}.`, "No attempt tried to instruct the grader.", "This is the learner's first refund for this course.", ...closing];

const proposal = (say: { checking: string; proposing: string }, closing: string[]): ScriptStep[] => [
  { say: say.checking, tool: CHECK_REFUND_POLICY, as: "policy", pauseMs: PAUSE_MS },
  {
    say: say.proposing,
    tool: REFUND_COURSE_PURCHASE,
    input: (results) => ({ amount: results.policy.paid.value, reasons: reasonsFrom(results.policy, closing) }),
    pauseMs: PAUSE_MS,
  },
];

const DISPUTE_REASON = "The learner opened a PayPal dispute, so accepting it is how PayPal pays the refund.";

const disputeProposal = (say: { checking: string; proposing: string }, closing: string[]): ScriptStep[] => [
  { say: say.checking, tool: CHECK_REFUND_POLICY, as: "policy", pauseMs: PAUSE_MS },
  { say: say.proposing, tool: ACCEPT_DISPUTE_CLAIM, input: (results) => ({ reasons: reasonsFrom(results.policy, [DISPUTE_REASON, ...closing]) }), pauseMs: PAUSE_MS },
];

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
    mockScript: () => {
      assertNoMockOutage();
      return proposal({ checking: "Checking the guarantee policy for this enrollment.", proposing: "The policy says a refund is due. Proposing the amount PayPal says was paid, then waiting for a person." }, []);
    },
  });

/**
 * What runs when the model can't. Same tools, same Guard, same person at the end, with reasons
 * built by code from the policy check. The learner's refund doesn't depend on a model being up.
 */
export const refundWithoutAi = (enrollmentId: string): AgentDefinition => ({
  ...refundAgent(enrollmentId),
  id: "refund-without-ai",
  name: "Refund check (no AI)",
  description: "Builds the refund proposal in code when the AI agent can't run. A person still decides.",
  mockScript: () => proposal({ checking: "The AI agent couldn't run, so code is checking the policy.", proposing: "The policy says a refund is due. Sending it to a person." }, ["The AI agent couldn't run, so code built this proposal from the policy check."]),
});

/**
 * The same agent when the learner has opened a PayPal dispute on the payment. A refund call beside
 * an open dispute would leave the dispute open, so it proposes accepting the claim instead. Same
 * policy check, same Guard, same person deciding.
 */
export const disputeRefundAgent = (enrollmentId: string): AgentDefinition =>
  defineAgent({
    id: "dispute-refund-agent",
    name: "Refund agent (PayPal dispute)",
    description: "Checks the guarantee policy when a learner has opened a PayPal dispute and proposes accepting it for a person to approve.",
    system: `You are the refund agent for Pass or Refund, an online course with a guarantee. You propose refunds. You never decide them: a person on the course team does. This learner has opened a PayPal dispute on their payment, so a refund is paid by accepting the dispute.

1. Call ${CHECK_REFUND_POLICY}.
2. If eligible is true, call ${ACCEPT_DISPUTE_CLAIM} once. Give two to four short reasons in plain English, using only the rules and attempts in the policy result. Mention the scores and the open dispute.
3. If eligible is false, do not call ${ACCEPT_DISPUTE_CLAIM}. Say which rule failed.

${ACCEPT_DISPUTE_CLAIM} pauses until a person decides. If they decline, or a tool refuses, do not propose again: say what happened and stop.`,
    tools: () => [checkRefundPolicy(enrollmentId), acceptCourseDispute(enrollmentId)],
    policy: appConfig.agentPolicy,
    effort: "low",
    maxTurns: 5,
    mockScript: () => {
      assertNoMockOutage();
      return disputeProposal({ checking: "Checking the guarantee policy for this enrollment.", proposing: "The policy says a refund is due and the learner has a PayPal dispute open. Proposing to accept it, then waiting for a person." }, []);
    },
  });

export const disputeRefundWithoutAi = (enrollmentId: string): AgentDefinition => ({
  ...disputeRefundAgent(enrollmentId),
  id: "dispute-refund-without-ai",
  name: "Refund check (PayPal dispute, no AI)",
  description: "Builds the dispute acceptance proposal in code when the AI agent can't run. A person still decides.",
  mockScript: () => disputeProposal({ checking: "The AI agent couldn't run, so code is checking the policy.", proposing: "The policy says a refund is due and the learner has a PayPal dispute open. Sending it to a person." }, ["The AI agent couldn't run, so code built this proposal from the policy check."]),
});

const hasOpenDispute = (enrollment: Enrollment) => !!enrollment.dispute && enrollment.dispute.status !== "RESOLVED";

/** The agent for this enrollment: accept the learner's open PayPal dispute, or refund the payment. */
export const refundAgentFor = (enrollment: Enrollment) => (hasOpenDispute(enrollment) ? disputeRefundAgent(enrollment.id) : refundAgent(enrollment.id));
export const refundWithoutAiFor = (enrollment: Enrollment) => (hasOpenDispute(enrollment) ? disputeRefundWithoutAi(enrollment.id) : refundWithoutAi(enrollment.id));
