import { z } from "zod";
import { startPurchase } from "@/lib/course/purchase";
import { readJson, route } from "@/lib/http";

const Body = z.object({ learnerName: z.string().trim().min(1).max(80) });

/** Opens an enrollment and its PayPal order. The price comes from the course, not this request. */
export const POST = route(async (req) => {
  const { learnerName } = await readJson(req, Body);
  const { enrollment, orderId } = await startPurchase(learnerName);
  return { enrollmentId: enrollment.id, orderId };
});
