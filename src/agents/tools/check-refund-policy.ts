/**
 * The refund agent's first step. Everything here is worked out by code: the policy from
 * lib/course/policy.ts and the amount paid from PayPal. Learners' written answers and names stay
 * out of the result, so nothing a learner typed reaches the agent.
 */
import { z } from "zod";
import { defineTool } from "@/lib/agent/tool";
import { guaranteeFor, requireEnrollment } from "@/lib/course/enrollments";
import { attemptComplete } from "@/lib/course/policy";
import { HttpError } from "@/lib/http";

export const CHECK_REFUND_POLICY = "check_refund_policy";

export const checkRefundPolicy = (enrollmentId: string) =>
  defineTool({
    name: CHECK_REFUND_POLICY,
    description: "Read the guarantee policy result for this enrollment: each rule, each attempt, and what the learner paid according to PayPal.",
    risk: "read",
    schema: z.object({}),
    title: () => "Check the guarantee policy",
    execute: async (_input, ctx) => {
      const enrollment = requireEnrollment(enrollmentId);
      const captureId = enrollment.payment?.captureId;
      if (!captureId) throw new HttpError(409, "This enrollment has no payment.", "conflict");
      const capture = await ctx.paypal.payments.getCapture(captureId);
      const { due, checks } = guaranteeFor(enrollment);
      return {
        eligible: due,
        rules: checks,
        attempts: enrollment.attempts.map((a) => ({ number: a.number, score: a.score, outcome: a.outcome, complete: attemptComplete(a), near_copy_of: a.nearCopyOf, reviewed_study_list: a.reviewedStudyList, flagged: a.flagged })),
        paid: capture.amount,
        capture_status: capture.status,
        open_dispute: enrollment.dispute && enrollment.dispute.status !== "RESOLVED" ? { reason: enrollment.dispute.reason, status: enrollment.dispute.status } : null,
      };
    },
  });
