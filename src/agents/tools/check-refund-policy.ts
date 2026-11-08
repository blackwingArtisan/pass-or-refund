/**
 * The refund agent's first step. Everything here is worked out by code: the policy from
 * lib/course/policy.ts, the amount paid from PayPal, and the case from lib/course/refund-case.ts.
 * The learner's written answers, the grader's quotes from them and the learner's name stay out of
 * the result. The one thing a learner typed that does come through is their contest of a rubric
 * line, because judging it is the point; the agent's tools can't move money on its say-so.
 */
import { z } from "zod";
import { defineTool } from "@/lib/agent/tool";
import { guaranteeFor, requireEnrollment } from "@/lib/course/enrollments";
import { attemptComplete } from "@/lib/course/policy";
import { refundCaseFor } from "@/lib/course/refund-case";
import { HttpError } from "@/lib/http";

export const CHECK_REFUND_POLICY = "check_refund_policy";

export const checkRefundPolicy = (enrollmentId: string) =>
  defineTool({
    name: CHECK_REFUND_POLICY,
    description: "Read the guarantee policy result for this enrollment: each rule, each attempt, what the learner paid according to PayPal, the rubric lines the learner fell short on, any contest of a line, and whether the case may go to a person for review.",
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
        ...refundCaseFor(enrollment),
      };
    },
  });
