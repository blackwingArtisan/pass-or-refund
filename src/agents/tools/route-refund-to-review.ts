/**
 * The refund agent's other choice: send a contested or borderline case to a person before any
 * refund is proposed. No money moves. Code decides which cases qualify (refund-case.ts), so the
 * agent can't park a clear refund, and a case a person already reviewed can't come back to them.
 */
import { z } from "zod";
import { defineTool } from "@/lib/agent/tool";
import { requireEnrollment, saveEnrollment } from "@/lib/course/enrollments";
import { refundCaseFor } from "@/lib/course/refund-case";
import { HttpError } from "@/lib/http";
import { fitNotes, NOTE_LIMITS as L } from "./note-limits";

export const ROUTE_TO_REVIEW = "route_refund_to_review";

export const routeRefundToReview = (enrollmentId: string) =>
  defineTool({
    name: ROUTE_TO_REVIEW,
    description: "Instead of proposing the refund, ask a person on the course team to look at this case first. Only allowed when can_route_to_review is true in the policy result: a contested rubric line or a borderline grade. No money moves.",
    risk: "write",
    schema: z.object({
      reason: z.string().min(1).max(L.reason).describe(`Why a person should look before a refund is proposed. Name the contested line or the borderline grade. At most ${L.reason} characters.`),
      team_summary: z.string().min(1).max(L.team_summary).describe(`Two or three sentences for the course team: scores, the lines the learner fell short on, the contest and its ruling. At most ${L.team_summary} characters.`),
      learner_note: z.string().min(1).max(L.learner_note).describe(`Two kind sentences the learner reads: a person on the course team is looking at their case before the refund, and why. At most ${L.learner_note} characters.`),
    }),
    fit: fitNotes,
    title: () => "Ask the course team to review before refunding",
    execute: async (i) => {
      const enrollment = requireEnrollment(enrollmentId);
      const rc = refundCaseFor(enrollment);
      // Not kept on the record: if the agent stops here, code still proposes the refund to a person.
      if (!rc.can_route_to_review)
        throw new HttpError(409, rc.reviewed_by_person ? "A person has already reviewed this case and sent it on, so propose the refund." : "This case isn't contested or borderline, so propose the refund: a person approves it either way.", "conflict");
      saveEnrollment({
        ...enrollment,
        status: "refund_review",
        refund: { ...enrollment.refund!, error: undefined, review: { reason: i.reason, teamSummary: i.team_summary, learnerNote: i.learner_note, at: new Date().toISOString() } },
      });
      return { routed: true, status: "refund_review" };
    },
  });
