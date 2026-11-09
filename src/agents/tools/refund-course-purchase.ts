/**
 * The refund. Runs behind the Guard, which stops at the approval gate before execute() is reached
 * (requireApprovalFor in app.config.ts). The agent says how much it wants and why, and code checks
 * all of it: the policy, and that the amount is exactly what PayPal says was paid. What moves is
 * read from the PayPal capture here, never taken from the agent. Both checks run again in
 * execute(), because time passes while a person decides.
 */
import { z } from "zod";
import { getApprovals } from "@/lib/agent/approvals";
import { defineTool } from "@/lib/agent/tool";
import { courseTitleOf } from "@/lib/course/creator-store";
import { guaranteeFor, readBackRefund, requireEnrollment, saveEnrollment } from "@/lib/course/enrollments";
import { formatCents, refundAmountProblem } from "@/lib/course/policy";
import { invoiceIdFor, refundNoteFor } from "@/lib/course/order-terms";
import { codeNotes } from "@/lib/course/refund-case";
import type { Refund } from "@/lib/course/types";
import { HttpError } from "@/lib/http";
import { moneyFromMinor, toMinor } from "@/lib/money";
import type { PayPalApi } from "@/lib/paypal/api";
import { runWithCallMeta, type CallMeta } from "@/lib/paypal/meta";

export const REFUND_COURSE_PURCHASE = "refund_course_purchase";

export function updateRefund(enrollmentId: string, update: Partial<Refund>, status = requireEnrollment(enrollmentId).status) {
  const enrollment = requireEnrollment(enrollmentId);
  return saveEnrollment({ ...enrollment, status, refund: { ...enrollment.refund!, ...update } });
}

/** Keeps the reason on the record, so the team and the learner see why nothing moved. */
export function refuse(enrollmentId: string, message: string): never {
  updateRefund(enrollmentId, { error: message });
  throw new HttpError(409, message, "conflict");
}

/** Reads the capture from PayPal, not from our record, and refuses one we can't refund in full. */
async function refundableAmount(enrollmentId: string, paypal: PayPalApi, captureId: string) {
  const capture = await paypal.payments.getCapture(captureId);
  if (capture.status !== "COMPLETED") refuse(enrollmentId, `This payment is ${capture.status}, so it can't be refunded in full.`);
  const { currency_code, value } = capture.amount;
  const cents = toMinor(value, currency_code);
  return { cents, amount: moneyFromMinor(cents, currency_code) };
}

/** Every rule, in code. Nothing the agent says gets past this. */
async function checked(enrollmentId: string, requested: string, paypal: PayPalApi) {
  const enrollment = requireEnrollment(enrollmentId);
  const captureId = enrollment.payment?.captureId;
  if (!captureId) refuse(enrollmentId, "This enrollment has no payment to refund.");
  const { due, checks } = guaranteeFor(enrollment);
  if (!due) refuse(enrollmentId, `The policy doesn't allow this refund. ${checks.filter((c) => !c.passed).map((c) => c.detail).join(" ")}`);
  const { cents, amount } = await refundableAmount(enrollmentId, paypal, captureId);
  const problem = refundAmountProblem(toMinor(requested, amount.currency_code), cents);
  if (problem) refuse(enrollmentId, problem);
  return { cents, amount, captureId };
}

export const refundCoursePurchase = (enrollmentId: string) =>
  defineTool({
    name: REFUND_COURSE_PURCHASE,
    label: "Every refund",
    description: "Propose refunding this learner. It pauses for a person to approve, and no money moves until they do. The amount must be exactly what the learner paid. Give your reasons: they are shown to the person deciding.",
    risk: "money",
    schema: z.object({
      amount: z.string().min(1).describe('Decimal string, such as "49.00"'),
      reasons: z.array(z.string().min(1).max(240)).min(1).max(5).describe("Why this refund is due, from the policy check. Plain sentences for the person deciding."),
      team_summary: z.string().min(1).max(600).optional().describe("Two or three sentences for the person deciding: the scores, the rubric lines the learner fell short on, any contest and how it was ruled."),
      learner_note: z.string().min(1).max(500).optional().describe("Two or three kind sentences the learner reads: sorry, which rubric lines held them back (never their answers), and that the refund comes once a person approves."),
    }),
    title: () => `Propose a refund for ${courseTitleOf(requireEnrollment(enrollmentId))}`,
    impact: async (i, ctx) => {
      // Once the agent has sent the case to a person, it waits for them; nothing is recorded, so their review stays clean.
      if (requireEnrollment(enrollmentId).status === "refund_review") throw new HttpError(409, "This case is with the course team for review, so wait for their decision.", "conflict");
      // A decline is final for this run. Asking again would need a person to reopen it.
      const decided = getApprovals().list({ runId: ctx.runId }).some((a) => a.tool === REFUND_COURSE_PURCHASE && a.state !== "pending");
      if (decided) refuse(enrollmentId, "A person has already decided on this refund, so the agent can't propose it again.");
      const { cents, amount } = await checked(enrollmentId, i.amount, ctx.paypal);
      // The agent writes the notes; code fills any it left out, so a person always has a summary.
      const fallback = codeNotes(requireEnrollment(enrollmentId));
      updateRefund(enrollmentId, {
        error: undefined,
        proposal: { amountValue: i.amount, reasons: i.reasons, proposedAt: new Date().toISOString(), teamSummary: i.team_summary ?? fallback.teamSummary, learnerNote: i.learner_note ?? fallback.learnerNote },
      });
      const { learnerName } = requireEnrollment(enrollmentId);
      return { amount, summary: `Refund ${formatCents(cents)} to ${learnerName}, who failed ${courseTitleOf(requireEnrollment(enrollmentId))} twice` };
    },
    execute: async (i, ctx) => {
      const { amount, captureId } = await checked(enrollmentId, i.amount, ctx.paypal);
      const call: CallMeta = {};
      // The note PayPal sends the learner is built in code from the graded record, never by the agent.
      const enrollment = requireEnrollment(enrollmentId);
      const refund = await runWithCallMeta(call, () => ctx.paypal.payments.refundCapture(captureId, { amount, invoice_id: invoiceIdFor(enrollment), note_to_payer: refundNoteFor(enrollment) }, { requestId: ctx.requestId }));
      // Saved before the read-back: if that read fails, the record must still say the money moved.
      updateRefund(enrollmentId, { refundId: refund.id, debugId: call.debugId, refundStatus: refund.status, refundedCents: toMinor(refund.amount.value, refund.amount.currency_code), error: undefined }, "refunded");

      const { refund: paid } = await readBackRefund(enrollmentId, ctx.paypal);
      return { refund_id: refund.id, status: paid?.refundStatus, refunded_cents: paid?.refundedCents, capture_status: paid?.captureStatus };
    },
  });
