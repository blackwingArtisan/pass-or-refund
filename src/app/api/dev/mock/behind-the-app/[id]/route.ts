import { z } from "zod";
import { requireEnrollment } from "@/lib/course/enrollments";
import { readJson, route } from "@/lib/http";
import { getPayPal } from "@/lib/paypal";

/**
 * Mock mode only: PayPal does the money step and our record never hears, which is what's left
 * behind when the app stops halfway through one. The sandbox suite does the same with direct calls.
 */
export const POST = route<RouteContext<"/api/dev/mock/behind-the-app/[id]">>(
  async (req, ctx) => {
    const { step } = await readJson(req, z.object({ step: z.enum(["capture", "refund"]) }));
    const { payment } = requireEnrollment((await ctx.params).id);
    if (step === "capture") return getPayPal().orders.capture(payment!.orderId);
    return getPayPal().payments.refundCapture(payment!.captureId!);
  },
  { mockOnly: true },
);
