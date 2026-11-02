/**
 * The refund. Runs behind the Guard, which stops at the approval gate before execute() is reached
 * (requireApprovalFor in app.config.ts). The amount is read from the PayPal capture here. Nothing
 * passes one in, so the AI has no way to set it.
 */
import { z } from "zod";
import { defineTool } from "@/lib/agent/tool";
import { course } from "@/lib/course/content";
import { formatCents } from "@/lib/course/policy";
import { HttpError } from "@/lib/http";
import { moneyFromMinor, toMinor } from "@/lib/money";
import type { PayPalApi } from "@/lib/paypal/api";

export const REFUND_COURSE_PURCHASE = "refund_course_purchase";

/** Reads the capture from PayPal, not from our record, and refuses one we can't refund in full. */
async function refundableAmount(paypal: PayPalApi, captureId: string) {
  const capture = await paypal.payments.getCapture(captureId);
  if (capture.status !== "COMPLETED") throw new HttpError(409, `This payment is ${capture.status}, so it can't be refunded in full.`, "conflict");
  const { currency_code, value } = capture.amount;
  const cents = toMinor(value, currency_code);
  return { cents, amount: moneyFromMinor(cents, currency_code) };
}

export const refundCoursePurchase = defineTool({
  name: REFUND_COURSE_PURCHASE,
  description: "Refund the full captured amount of a course purchase after two completed failing attempts.",
  risk: "money",
  schema: z.object({
    capture_id: z.string().min(5),
    learner_name: z.string().min(1),
    idempotency_key: z.string().describe("Same key: never refunded twice"),
  }),
  title: (i) => `Refund ${i.learner_name}`,
  impact: async (i, ctx) => {
    const { cents, amount } = await refundableAmount(ctx.paypal, i.capture_id);
    return { amount, summary: `Refund ${formatCents(cents)} to ${i.learner_name}, who failed ${course.title} twice` };
  },
  execute: async (i, ctx) => {
    // Checked again: time passes while the course team decides.
    const { amount } = await refundableAmount(ctx.paypal, i.capture_id);
    const refund = await ctx.paypal.payments.refundCapture(i.capture_id, { amount, note_to_payer: `Refund for ${course.title}. Sorry we let you down.` }, { requestId: ctx.requestId });
    return { refund_id: refund.id, status: refund.status, amount: refund.amount };
  },
});
