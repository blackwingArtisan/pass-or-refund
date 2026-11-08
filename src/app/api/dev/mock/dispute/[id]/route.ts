import { requireEnrollment } from "@/lib/course/enrollments";
import { HttpError, route } from "@/lib/http";
import { getMockPayPal } from "@/lib/paypal";

/** Mock mode only: the learner opens a PayPal dispute on their payment, and CUSTOMER.DISPUTE.CREATED goes out. */
export const POST = route<RouteContext<"/api/dev/mock/dispute/[id]">>(
  async (_req, ctx) => {
    const captureId = requireEnrollment((await ctx.params).id).payment?.captureId;
    if (!captureId) throw new HttpError(409, "This enrollment has no payment to dispute.", "conflict");
    return getMockPayPal()!.simulateDispute({ captureId, reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", buyerMessage: "I did the course and still couldn't do it." });
  },
  { mockOnly: true },
);
