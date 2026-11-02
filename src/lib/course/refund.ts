/**
 * Moves the refund money: policy says it is due, a person approves at the gate, PayPal pays it,
 * and the result is re-read from PayPal. The route returns while this waits for the person; the
 * browser polls the enrollment.
 */
import { randomUUID } from "node:crypto";
import { appConfig } from "@/app.config";
import { refundCoursePurchase } from "@/agents/tools/refund-course-purchase";
import { runTool, type ToolCallResult } from "@/lib/agent/execute";
import { Guard } from "@/lib/agent/guard";
import { withContext } from "@/lib/events/bus";
import { HttpError } from "@/lib/http";
import { toMinor } from "@/lib/money";
import { getPayPal } from "@/lib/paypal";
import { activeRefunds, requireEnrollment, saveEnrollment } from "./enrollments";
import { refundDue } from "./policy";
import type { Enrollment, Refund } from "./types";

function failureReason(result: ToolCallResult): string {
  const outcome = result.outcome;
  if (outcome?.status === "denied") return outcome.reason;
  if (outcome?.status === "failed") return (outcome.error as Error)?.message ?? "PayPal call failed.";
  return result.content;
}

function blockRefund(id: string, error: string) {
  const enrollment = requireEnrollment(id);
  saveEnrollment({ ...enrollment, status: "refund_blocked", refund: { ...enrollment.refund!, error } });
}

async function refund(id: string, channel: string) {
  const { payment, refund: record, learnerName } = requireEnrollment(id);
  if (!payment?.captureId || !record) throw new Error(`Enrollment ${id} has no payment to refund.`);
  const paypal = getPayPal();
  const guard = new Guard({ paypal, policy: appConfig.agentPolicy });
  const result = await runTool(
    refundCoursePurchase,
    { capture_id: payment.captureId, learner_name: learnerName, idempotency_key: `refund-${id}` },
    { runId: record.runId, actor: "policy", channel, guard },
  );
  if (result.isError) {
    blockRefund(id, failureReason(result));
    return;
  }

  // The result screen shows what PayPal says happened, not what we asked for.
  const { refund_id: refundId } = result.output as { refund_id: string };
  const paid = await paypal.payments.getRefund(refundId);
  const capture = await paypal.payments.getCapture(payment.captureId);
  const reread: Partial<Refund> = {
    refundId,
    refundStatus: paid.status,
    refundedCents: toMinor(paid.amount.value, paid.amount.currency_code),
    captureStatus: capture.status,
    rereadAt: new Date().toISOString(),
    error: undefined,
  };
  const enrollment = requireEnrollment(id);
  saveEnrollment({ ...enrollment, status: "refunded", refund: { ...enrollment.refund!, ...reread } });
}

function start(id: string, channel: string, runId: string) {
  activeRefunds().add(id);
  return withContext({ channel, runId, actor: "policy" }, () => refund(id, channel))
    .catch((e) => blockRefund(id, e instanceof Error ? e.message : String(e)))
    .finally(() => activeRefunds().delete(id));
}

/** Sends a refund the policy says is due to the approval gate. No money moves until it is approved. */
export function requestRefund(enrollment: Enrollment, channel: string): { enrollment: Enrollment; finished: Promise<void> } {
  if (activeRefunds().has(enrollment.id)) throw new HttpError(409, "This refund is already waiting for approval.", "conflict");
  if (!refundDue(enrollment.attempts)) throw new HttpError(409, "The guarantee doesn't cover this enrollment.", "conflict");
  if (!enrollment.payment?.captureId) throw new HttpError(409, "This enrollment has no payment to refund.", "conflict");
  const runId = `refund_${randomUUID().slice(0, 12)}`;
  const saved = saveEnrollment({ ...enrollment, status: "refund_pending", refund: { runId, requestedAt: new Date().toISOString() } });
  return { enrollment: saved, finished: start(enrollment.id, channel, runId) };
}

/** The course team asks again after a decline, a timeout or a PayPal error. */
export function retryRefund(id: string, channel: string): { enrollment: Enrollment; finished: Promise<void> } {
  const enrollment = requireEnrollment(id);
  if (enrollment.status !== "refund_blocked") throw new HttpError(409, "No refund is blocked on this enrollment.", "conflict");
  return requestRefund(enrollment, channel);
}
