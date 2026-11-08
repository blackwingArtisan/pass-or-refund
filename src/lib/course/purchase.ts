/** Buying the course: the order is created on the server and the capture goes through the Guard. */
import { appConfig } from "@/app.config";
import { captureCoursePayment } from "@/agents/tools/capture-course-payment";
import { runTool } from "@/lib/agent/execute";
import { Guard } from "@/lib/agent/guard";
import { withContext } from "@/lib/events/bus";
import { HttpError } from "@/lib/http";
import { moneyFromMinor, toMinor } from "@/lib/money";
import { getPayPal } from "@/lib/paypal";
import { singleton } from "@/lib/singleton";
import { course, COURSE_PRICE_CENTS, CURRENCY } from "./content";
import { enrollmentChannel } from "./scope";
import { createEnrollment, recoveredUnstartedFor, requireEnrollment, saveEnrollment, unpaidFor } from "./enrollments";
import type { Enrollment, Payment } from "./types";
import type { Order } from "@/lib/paypal/types";

/** Abandoned checkouts pile up, so a returning learner only re-checks their latest few. */
const CHECKOUTS_TO_RECHECK = 5;

/** PayPal gives a wallet buyer a payer id. A guest card buyer in PayPal's window still gives PayPal an email. */
const payerIdOf = (order: Order) => order.payer?.payer_id ?? order.payment_source?.paypal?.account_id;
const payerEmailOf = (order: Order) => order.payer?.email_address ?? order.payment_source?.paypal?.email_address;

function recordPayment(enrollment: Enrollment, payment: Payment): Enrollment {
  return saveEnrollment({ ...enrollment, status: "active", payment });
}

/**
 * PayPal took the money but our record never heard, because the app stopped in between. PayPal is
 * the record, so this rebuilds ours from the order. Returns null when PayPal hasn't been paid.
 */
function fromCompletedOrder(enrollment: Enrollment, order: Order): Enrollment | null {
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (order.status !== "COMPLETED" || capture?.status !== "COMPLETED") return null;
  const cents = toMinor(capture.amount.value, capture.amount.currency_code);
  if (cents !== COURSE_PRICE_CENTS) return null;
  return recordPayment(enrollment, { orderId: order.id, orderStatus: order.status, captureId: capture.id, captureStatus: capture.status, capturedCents: cents, paidAt: new Date().toISOString(), payerId: payerIdOf(order), payerEmail: payerEmailOf(order), recovered: true });
}

/** PayPal's window and the page's own check can both finish one purchase at once: they share the work. */
const finishing = singleton("course:finishing-purchase", () => new Map<string, Promise<Enrollment>>());

/** Called when anyone looks at an unpaid enrollment, so a reload is enough to get a learner unstuck. */
export async function recoverPayment(enrollment: Enrollment): Promise<Enrollment> {
  // A capture is still on its way back from PayPal: that's this purchase finishing, not one we lost.
  const running = finishing.get(enrollment.id);
  if (running) return running.catch(() => requireEnrollment(enrollment.id));
  return paidAtPayPal(enrollment);
}

/** The enrollment rebuilt from PayPal's order if PayPal took the money, else as it was. */
async function paidAtPayPal(enrollment: Enrollment): Promise<Enrollment> {
  const orderId = enrollment.payment?.orderId;
  if (enrollment.status !== "unpaid" || !orderId) return enrollment;
  const order = await getPayPal().orders.get(orderId).catch(() => null);
  return (order && fromCompletedOrder(enrollment, order)) ?? enrollment;
}

/**
 * Before a new order: has this learner already paid, or said yes in PayPal, on a checkout we lost
 * track of? Then they carry on with that one, and PayPal never sees a second payment.
 */
export async function resumePurchase(learnerEmail: string, channel: string): Promise<Enrollment | null> {
  const recovered = recoveredUnstartedFor(learnerEmail);
  if (recovered) return recovered;
  for (const enrollment of unpaidFor(learnerEmail).slice(0, CHECKOUTS_TO_RECHECK)) {
    const orderId = enrollment.payment!.orderId;
    const order = await getPayPal().orders.get(orderId).catch(() => null);
    if (!order) continue;
    const paid = fromCompletedOrder(enrollment, order);
    if (paid) return paid;
    if (order.status === "APPROVED") return completePurchase(enrollment.id, orderId, channel);
  }
  return null;
}

/** The amount comes from the course, never the browser. */
export async function startPurchase(learnerName: string, learnerEmail: string, opts: { testRun?: boolean } = {}): Promise<{ enrollment: Enrollment; orderId: string }> {
  const created = createEnrollment(learnerName, learnerEmail, opts);
  // On the learner's own timeline, so it starts where the money does: Create order, then Capture.
  const order = await withContext({ channel: enrollmentChannel(created.id) }, () =>
    getPayPal().orders.create(
      {
        intent: "CAPTURE",
        purchase_units: [{ amount: moneyFromMinor(COURSE_PRICE_CENTS, CURRENCY), description: `${course.title} by ${course.creator}`, custom_id: created.id }],
      },
      { requestId: `order-${created.id}` },
    ),
  );
  return { enrollment: saveEnrollment({ ...created, payment: { orderId: order.id, orderStatus: order.status } }), orderId: order.id };
}


export function completePurchase(id: string, orderId: string, channel: string): Promise<Enrollment> {
  const running = finishing.get(id);
  if (running) return running;
  const work = capturePurchase(id, orderId, channel).finally(() => finishing.delete(id));
  finishing.set(id, work);
  return work;
}

/**
 * Asked by the course page while PayPal's window is open. If the buyer approved in PayPal but the
 * window never told the page (it happens with one of PayPal's checkout pages), PayPal still says
 * APPROVED, so the purchase finishes here, through the same Guard. Nothing is captured before then.
 */
export async function checkCheckout(id: string, channel: string): Promise<Enrollment> {
  const enrollment = requireEnrollment(id);
  const orderId = enrollment.payment?.orderId;
  if (enrollment.status !== "unpaid" || !orderId) return enrollment;
  const order = await getPayPal().orders.get(orderId).catch(() => null);
  if (!order) return enrollment;
  const paid = fromCompletedOrder(enrollment, order);
  if (paid) return paid;
  return order.status === "APPROVED" ? completePurchase(id, orderId, channel) : enrollment;
}

async function capturePurchase(id: string, orderId: string, channel: string): Promise<Enrollment> {
  const enrollment = requireEnrollment(id);
  if (enrollment.payment?.orderId !== orderId) throw new HttpError(409, "That PayPal order doesn't belong to this purchase.", "conflict");
  if (enrollment.status !== "unpaid") return enrollment;
  const recovered = await paidAtPayPal(enrollment);
  if (recovered.status !== "unpaid") return recovered;

  const guard = new Guard({ paypal: getPayPal(), policy: appConfig.agentPolicy });
  const result = await runTool(captureCoursePayment, { order_id: orderId, idempotency_key: `capture-${id}` }, { runId: `purchase_${id}`, actor: "learner", channel, guard });
  if (result.isError) {
    const outcome = result.outcome;
    const reason = outcome?.status === "denied" ? outcome.reason : outcome?.status === "failed" ? (outcome.error as Error).message : result.content;
    throw new HttpError(402, `The payment didn't go through: ${reason}`, "capture_failed");
  }
  const capture = result.output as { order_status: string; capture_id: string; capture_status: string; amount: { currency_code: string; value: string }; payer_id?: string; payer_email?: string };
  if (capture.capture_status !== "COMPLETED") throw new HttpError(402, `PayPal shows this payment as ${capture.capture_status}, so the course isn't unlocked yet.`, "capture_failed");
  return recordPayment(enrollment, {
    orderId,
    orderStatus: capture.order_status,
    captureId: capture.capture_id,
    captureStatus: capture.capture_status,
    capturedCents: toMinor(capture.amount.value, capture.amount.currency_code),
    paidAt: new Date().toISOString(),
    payerId: capture.payer_id,
    payerEmail: capture.payer_email,
  });
}
