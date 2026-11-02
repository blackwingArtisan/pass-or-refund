import { z } from "zod";
import { resumePurchase, startPurchase } from "@/lib/course/purchase";
import { getContext } from "@/lib/events/bus";
import { readJson, route } from "@/lib/http";

const Body = z.object({ learnerName: z.string().trim().min(1).max(80), learnerEmail: z.email().max(200) });

/** Opens an enrollment and its PayPal order, unless this learner has already paid. The price comes from the course, not this request. */
export const POST = route(async (req) => {
  const { learnerName, learnerEmail } = await readJson(req, Body);
  const paid = await resumePurchase(learnerEmail, getContext().channel);
  if (paid) return { enrollmentId: paid.id, alreadyPaid: true };
  const { enrollment, orderId } = await startPurchase(learnerName, learnerEmail);
  return { enrollmentId: enrollment.id, orderId };
});
