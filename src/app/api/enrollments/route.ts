import { z } from "zod";
import { startPurchase } from "@/lib/course/purchase";
import { readJson, route } from "@/lib/http";

const Body = z.object({ learnerName: z.string().trim().min(1).max(80), learnerEmail: z.email().max(200) });

/** Opens an enrollment and its PayPal order. The price comes from the course, not this request. */
export const POST = route(async (req) => {
  const { learnerName, learnerEmail } = await readJson(req, Body);
  const { enrollment, orderId } = await startPurchase(learnerName, learnerEmail);
  return { enrollmentId: enrollment.id, orderId };
});
