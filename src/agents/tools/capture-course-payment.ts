/**
 * Takes the payment the learner just approved. Runs behind the Guard. The price is at the approval
 * threshold, not above it, so this runs without a second person: the learner has already said yes
 * in PayPal.
 */
import { z } from "zod";
import { defineTool } from "@/lib/agent/tool";
import { course, COURSE_PRICE_CENTS, CURRENCY } from "@/lib/course/content";
import { formatCents } from "@/lib/course/policy";
import { HttpError } from "@/lib/http";
import { moneyFromMinor, toMinor } from "@/lib/money";
import type { PayPalApi } from "@/lib/paypal/api";

export const CAPTURE_COURSE_PAYMENT = "capture_course_payment";

async function assertApprovedAtPrice(paypal: PayPalApi, orderId: string) {
  const order = await paypal.orders.get(orderId);
  if (order.status !== "APPROVED") throw new HttpError(409, `This PayPal order is ${order.status}, not approved.`, "conflict");
  const amount = order.purchase_units?.[0]?.amount;
  if (!amount || toMinor(amount.value, amount.currency_code) !== COURSE_PRICE_CENTS) throw new HttpError(409, "This PayPal order isn't for the course price.", "conflict");
}

export const captureCoursePayment = defineTool({
  name: CAPTURE_COURSE_PAYMENT,
  description: "Capture the course price from a PayPal order the learner approved.",
  risk: "money",
  schema: z.object({
    order_id: z.string().min(5),
    idempotency_key: z.string().describe("Same key: never captured twice"),
  }),
  title: () => `Take ${formatCents(COURSE_PRICE_CENTS)} for ${course.title}`,
  impact: async (i, ctx) => {
    await assertApprovedAtPrice(ctx.paypal, i.order_id);
    return { amount: moneyFromMinor(COURSE_PRICE_CENTS, CURRENCY), summary: `Take the ${formatCents(COURSE_PRICE_CENTS)} the learner approved for ${course.title}` };
  },
  execute: async (i, ctx) => {
    const order = await ctx.paypal.orders.capture(i.order_id, { requestId: ctx.requestId });
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture) throw new HttpError(402, `PayPal returned no capture (order ${order.status}).`, "capture_failed");
    return { order_id: order.id, order_status: order.status, capture_id: capture.id, capture_status: capture.status, amount: capture.amount };
  },
});
