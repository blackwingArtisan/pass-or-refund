/**
 * The refund, when the learner has opened a PayPal dispute: accepting their claim is how PayPal
 * pays it back. Runs behind the Guard, which holds it for a person (requireApprovalFor in
 * app.config.ts). Code checks everything: the policy, that the dispute is open and about this
 * learner's payment, and that it asks for exactly what PayPal says was paid. The agent only gives
 * its reasons. The checks run again in execute(), because time passes while a person decides.
 */
import { z } from "zod";
import { getApprovals } from "@/lib/agent/approvals";
import { defineTool } from "@/lib/agent/tool";
import { course } from "@/lib/course/content";
import { guaranteeFor, readBackRefund, requireEnrollment, saveEnrollment } from "@/lib/course/enrollments";
import { formatCents } from "@/lib/course/policy";
import { moneyFromMinor, toMinor } from "@/lib/money";
import type { PayPalApi } from "@/lib/paypal/api";
import { refuse, updateRefund } from "./refund-course-purchase";

export const ACCEPT_DISPUTE_CLAIM = "accept_dispute_claim";

async function checked(enrollmentId: string, paypal: PayPalApi) {
  const enrollment = requireEnrollment(enrollmentId);
  const captureId = enrollment.payment?.captureId;
  const disputeId = enrollment.dispute?.id;
  if (!captureId || !disputeId) refuse(enrollmentId, "This enrollment has no PayPal dispute to accept.");
  const { due, checks } = guaranteeFor(enrollment);
  if (!due) refuse(enrollmentId, `The policy doesn't allow this refund. ${checks.filter((c) => !c.passed).map((c) => c.detail).join(" ")}`);
  const dispute = await paypal.disputes.get(disputeId);
  if (dispute.status === "RESOLVED") refuse(enrollmentId, "PayPal has already closed this dispute.");
  if (!dispute.disputed_transactions.some((t) => t.seller_transaction_id === captureId)) refuse(enrollmentId, "This dispute isn't about this learner's payment.");
  const capture = await paypal.payments.getCapture(captureId);
  if (capture.status !== "COMPLETED") refuse(enrollmentId, `This payment is ${capture.status}, so it can't be refunded in full.`);
  const cents = toMinor(capture.amount.value, capture.amount.currency_code);
  const asked = toMinor(dispute.dispute_amount.value, dispute.dispute_amount.currency_code);
  if (asked !== cents) refuse(enrollmentId, `The dispute asks for ${formatCents(asked)}, not the ${formatCents(cents)} paid, so a person should answer it in PayPal.`);
  return { cents, amount: moneyFromMinor(cents, capture.amount.currency_code), disputeId, captureId };
}

export const acceptCourseDispute = (enrollmentId: string) =>
  defineTool({
    name: ACCEPT_DISPUTE_CLAIM,
    label: "Accepting a PayPal dispute",
    description: "The learner opened a PayPal dispute. Propose accepting it, which refunds them in full through PayPal. It pauses for a person to approve, and no money moves until they do. Give your reasons: they are shown to the person deciding.",
    risk: "money",
    schema: z.object({
      reasons: z.array(z.string().min(1).max(240)).min(1).max(5).describe("Why this refund is due, from the policy check. Plain sentences for the person deciding."),
    }),
    title: () => `Propose accepting the PayPal dispute for ${course.title}`,
    impact: async (i, ctx) => {
      const decided = getApprovals().list({ runId: ctx.runId }).some((a) => a.tool === ACCEPT_DISPUTE_CLAIM && a.state !== "pending");
      if (decided) refuse(enrollmentId, "A person has already decided on this refund, so the agent can't propose it again.");
      const { cents, amount } = await checked(enrollmentId, ctx.paypal);
      updateRefund(enrollmentId, { error: undefined, proposal: { amountValue: amount.value, reasons: i.reasons, proposedAt: new Date().toISOString() } });
      const { learnerName } = requireEnrollment(enrollmentId);
      return { amount, summary: `Accept ${learnerName}'s PayPal dispute and refund ${formatCents(cents)}: they failed ${course.title} twice` };
    },
    execute: async (_i, ctx) => {
      const { disputeId } = await checked(enrollmentId, ctx.paypal);
      await ctx.paypal.disputes.acceptClaim(disputeId, { note: `Refund for ${course.title}. Sorry we let you down.`, accept_claim_type: "REFUND" });
      // Saved first: the claim is accepted, so the record must say so even if the reads below fail.
      const before = requireEnrollment(enrollmentId);
      if (!before.refund?.refundId) updateRefund(enrollmentId, { viaDispute: disputeId, refundStatus: "PENDING", refundStatusReason: "DISPUTE", error: undefined }, "refunded");
      else updateRefund(enrollmentId, { viaDispute: disputeId, error: undefined }, "refunded");

      // PayPal pays the claim as a refund on the order. If it isn't there yet, the REFUNDED webhook records it.
      const order = await ctx.paypal.orders.get(before.payment!.orderId);
      const paid = order.purchase_units?.[0]?.payments?.refunds?.[0];
      if (paid && !requireEnrollment(enrollmentId).refund?.refundId) updateRefund(enrollmentId, { refundId: paid.id, refundStatus: paid.status, refundedCents: toMinor(paid.amount.value, paid.amount.currency_code) });
      const dispute = await ctx.paypal.disputes.get(disputeId);
      const latest = requireEnrollment(enrollmentId);
      saveEnrollment({ ...latest, dispute: { ...latest.dispute!, status: dispute.status, outcome: dispute.dispute_outcome?.outcome_code, updatedAt: new Date().toISOString() } });
      const { refund } = latest.refund?.refundId ? await readBackRefund(enrollmentId, ctx.paypal) : latest;
      return { dispute_id: disputeId, dispute_status: dispute.status, refund_id: refund?.refundId, status: refund?.refundStatus, refunded_cents: refund?.refundedCents };
    },
  });
