/**
 * PayPal's webhooks for the course. Each one is matched to its enrollment by PayPal's own ids, then:
 *   PAYMENT.CAPTURE.COMPLETED  confirms the payment, and enrolls a learner whose record missed it
 *   PAYMENT.CAPTURE.REFUNDED   records the refund and settles a PENDING one, with no polling
 *   CUSTOMER.DISPUTE.*         attaches the learner's dispute. If the guarantee covers them, the
 *                              refund agent proposes accepting it, and a person decides at the Guard.
 * Server only. Registered from lib/paypal/handlers.ts.
 */
import { getApprovals } from "@/lib/agent/approvals";
import { toMinor } from "@/lib/money";
import { getPayPal } from "@/lib/paypal";
import type * as T from "@/lib/paypal/types";
import { onWebhook, type AnyWebhookEvent } from "@/lib/paypal/webhooks";
import { activeRefunds, enrollmentForPayPalId, guaranteeFor, readBackRefund, requireEnrollment, saveEnrollment } from "./enrollments";
import { recoverPayment } from "./purchase";
import { requestRefund } from "./refund";
import { enrollmentChannel, TEAM_CHANNEL } from "./scope";
import type { CourseDispute, Enrollment } from "./types";

type Resource = Record<string, unknown> & {
  id?: string;
  links?: T.Link[];
  supplementary_data?: { related_ids?: { order_id?: string } };
  disputed_transactions?: { seller_transaction_id?: string }[];
};

const captureOfRefund = (r: Resource) => r.links?.find((l) => l.rel === "up" && l.href.includes("/captures/"))?.href.split("/").pop();

/** The enrollment a webhook is about, found by PayPal's ids. Undefined for anything that isn't the course's. */
export function enrollmentForEvent(event: AnyWebhookEvent): Enrollment | undefined {
  const r = event.resource as Resource;
  const type = event.event_type;
  if (type.startsWith("CHECKOUT.ORDER.")) return enrollmentForPayPalId({ orderId: r.id });
  if (type === "PAYMENT.CAPTURE.REFUNDED" || type === "PAYMENT.CAPTURE.REVERSED") return enrollmentForPayPalId({ refundId: r.id }) ?? enrollmentForPayPalId({ captureId: captureOfRefund(r) });
  if (type.startsWith("PAYMENT.CAPTURE.")) return enrollmentForPayPalId({ captureId: r.id }) ?? enrollmentForPayPalId({ orderId: r.supplementary_data?.related_ids?.order_id });
  if (type.startsWith("CUSTOMER.DISPUTE.")) {
    for (const t of r.disputed_transactions ?? []) {
      const found = enrollmentForPayPalId({ captureId: t.seller_transaction_id });
      if (found) return found;
    }
  }
  return undefined;
}

/** Every webhook goes to the course team. One that belongs to an enrollment also goes to that learner. */
export function webhookChannels(event: AnyWebhookEvent): string[] {
  const enrollment = enrollmentForEvent(event);
  return enrollment ? [TEAM_CHANNEL, enrollmentChannel(enrollment.id)] : [TEAM_CHANNEL];
}

const now = () => new Date().toISOString();

/** How long a capture webhook waits for the purchase that's still saving it, before rebuilding it from PayPal. */
const SAVING_GRACE_MS = 3000;

async function settledPurchase(enrollment: Enrollment): Promise<Enrollment> {
  const until = Date.now() + SAVING_GRACE_MS;
  while (Date.now() < until) {
    const latest = requireEnrollment(enrollment.id);
    if (latest.status !== "unpaid") return latest;
    await new Promise((r) => setTimeout(r, 250));
  }
  // Still unpaid: the app stopped after PayPal took the money. PayPal's order rebuilds the record.
  return recoverPayment(requireEnrollment(enrollment.id));
}

export async function onCaptureCompleted(event: AnyWebhookEvent) {
  const found = enrollmentForEvent(event);
  if (!found) return;
  const enrollment = found.status === "unpaid" ? await settledPurchase(found) : found;
  const latest = requireEnrollment(enrollment.id);
  if (latest.payment?.captureId !== (event.resource as Resource).id) return;
  saveEnrollment({ ...latest, payment: { ...latest.payment!, webhookAt: now() } });
}

export async function onCaptureRefunded(event: AnyWebhookEvent) {
  const found = enrollmentForEvent(event);
  const r = event.resource as unknown as T.Refund;
  if (!found?.payment?.captureId) return;
  // The course pays one full refund per enrollment. Another refund on the payment isn't ours to record.
  if (found.refund?.refundId && found.refund.refundId !== r.id) return;
  const latest = requireEnrollment(found.id);
  const at = now();
  const ours = latest.refund?.refundId === r.id;
  saveEnrollment({
    ...latest,
    status: "refunded",
    refund: {
      ...(latest.refund ?? { runId: "", requestedAt: r.create_time ?? at }),
      error: undefined,
      refundId: r.id,
      refundStatus: r.status,
      refundStatusReason: r.status_details?.reason,
      refundedCents: toMinor(r.amount.value, r.amount.currency_code),
      webhookAt: at,
      webhookStatus: r.status,
    },
  });
  // Paid outside this app, say from PayPal's dashboard: a refund still waiting for a person has nothing left to approve.
  const runId = latest.refund?.runId;
  if (!ours && runId) for (const a of getApprovals().list({ runId, state: "pending" })) getApprovals().decide(a.id, "denied", "PayPal", "PayPal has already refunded this payment, so there is nothing left to approve.");
  // One read, prompted by the webhook rather than a timer: the payment's own status moves with the refund.
  await readBackRefund(found.id, getPayPal()).catch(() => undefined);
}

const PLAIN_OUTCOME: Record<string, string> = {
  RESOLVED_BUYER_FAVOUR: "in the learner's favour, with the money back to them",
  RESOLVED_SELLER_FAVOUR: "in the course's favour",
  CANCELED_BY_BUYER: "because the learner withdrew it",
};

function disputeFrom(d: T.Dispute, before?: CourseDispute): CourseDispute {
  return {
    ...before,
    id: d.dispute_id,
    reason: d.reason,
    status: d.status,
    amountCents: toMinor(d.dispute_amount.value, d.dispute_amount.currency_code),
    openedAt: before?.openedAt ?? d.create_time ?? now(),
    updatedAt: now(),
    outcome: d.dispute_outcome?.outcome_code ?? before?.outcome,
  };
}

/** What the course does about a new dispute, by the same policy as any other refund. */
function respondTo(enrollment: Enrollment): string {
  if (enrollment.status === "refunded") return "This payment was already refunded, so PayPal can close the dispute with that refund.";
  if (activeRefunds().has(enrollment.id)) return "A refund for this learner is already waiting for a person on the course team.";
  const { due, checks } = guaranteeFor(enrollment);
  if (!due) return `The guarantee doesn't cover this yet, so nothing is proposed. ${checks.filter((c) => !c.passed).map((c) => c.detail).join(" ")} Answer it in PayPal's Resolution Center.`;
  requestRefund(enrollment, enrollmentChannel(enrollment.id));
  return "The guarantee covers this learner, so the refund agent proposes accepting the dispute. No money moves until a person approves.";
}

export async function onDisputeCreated(event: AnyWebhookEvent) {
  const found = enrollmentForEvent(event);
  if (!found) return;
  const latest = requireEnrollment(found.id);
  const saved = saveEnrollment({ ...latest, dispute: disputeFrom(event.resource as T.Dispute, latest.dispute) });
  const note = respondTo(saved);
  const after = requireEnrollment(found.id);
  saveEnrollment({ ...after, dispute: { ...after.dispute!, note } });
}

export async function onDisputeChanged(event: AnyWebhookEvent) {
  const found = enrollmentForEvent(event);
  if (!found) return;
  const latest = requireEnrollment(found.id);
  const dispute = disputeFrom(event.resource as T.Dispute, latest.dispute);
  const note = dispute.status === "RESOLVED" ? `PayPal closed the dispute ${PLAIN_OUTCOME[dispute.outcome ?? ""] ?? ""}.`.replace(" .", ".") : dispute.note;
  saveEnrollment({ ...latest, dispute: { ...dispute, note } });
}

onWebhook("PAYMENT.CAPTURE.COMPLETED", onCaptureCompleted);
onWebhook("PAYMENT.CAPTURE.REFUNDED", onCaptureRefunded);
onWebhook("CUSTOMER.DISPUTE.CREATED", onDisputeCreated);
onWebhook("CUSTOMER.DISPUTE.UPDATED", onDisputeChanged);
onWebhook("CUSTOMER.DISPUTE.RESOLVED", onDisputeChanged);
