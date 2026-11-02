/** Buying the course: the order is created on the server and the capture goes through the Guard. */
import { appConfig } from "@/app.config";
import { captureCoursePayment } from "@/agents/tools/capture-course-payment";
import { runTool } from "@/lib/agent/execute";
import { Guard } from "@/lib/agent/guard";
import { HttpError } from "@/lib/http";
import { moneyFromMinor, toMinor } from "@/lib/money";
import { getPayPal } from "@/lib/paypal";
import { course, COURSE_PRICE_CENTS, CURRENCY } from "./content";
import { createEnrollment, requireEnrollment, saveEnrollment } from "./enrollments";
import type { Enrollment } from "./types";

/** The amount comes from the course, never the browser. */
export async function startPurchase(learnerName: string, learnerEmail: string): Promise<{ enrollment: Enrollment; orderId: string }> {
  const created = createEnrollment(learnerName, learnerEmail);
  const order = await getPayPal().orders.create(
    {
      intent: "CAPTURE",
      purchase_units: [{ amount: moneyFromMinor(COURSE_PRICE_CENTS, CURRENCY), description: `${course.title} by ${course.creator}`, custom_id: created.id }],
    },
    { requestId: `order-${created.id}` },
  );
  return { enrollment: saveEnrollment({ ...created, payment: { orderId: order.id, orderStatus: order.status } }), orderId: order.id };
}

export async function completePurchase(id: string, orderId: string, channel: string): Promise<Enrollment> {
  const enrollment = requireEnrollment(id);
  if (enrollment.status !== "unpaid") throw new HttpError(409, "This course has already been paid for.", "conflict");
  if (enrollment.payment?.orderId !== orderId) throw new HttpError(409, "That PayPal order doesn't belong to this purchase.", "conflict");

  const guard = new Guard({ paypal: getPayPal(), policy: appConfig.agentPolicy });
  const result = await runTool(captureCoursePayment, { order_id: orderId, idempotency_key: `capture-${id}` }, { runId: `purchase_${id}`, actor: "learner", channel, guard });
  if (result.isError) {
    const outcome = result.outcome;
    const reason = outcome?.status === "denied" ? outcome.reason : outcome?.status === "failed" ? (outcome.error as Error).message : result.content;
    throw new HttpError(402, `The payment didn't go through: ${reason}`, "capture_failed");
  }
  const capture = result.output as { order_status: string; capture_id: string; capture_status: string; amount: { currency_code: string; value: string } };
  if (capture.capture_status !== "COMPLETED") throw new HttpError(402, `PayPal shows this payment as ${capture.capture_status}, so the course isn't unlocked yet.`, "capture_failed");
  return saveEnrollment({
    ...enrollment,
    status: "active",
    payment: {
      orderId,
      orderStatus: capture.order_status,
      captureId: capture.capture_id,
      captureStatus: capture.capture_status,
      capturedCents: toMinor(capture.amount.value, capture.amount.currency_code),
      paidAt: new Date().toISOString(),
    },
  });
}
