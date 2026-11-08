import { z } from "zod";
import { resumePurchase, startPurchase } from "@/lib/course/purchase";
import { getContext } from "@/lib/events/bus";
import { isTestRun } from "@/lib/course/team-access";
import { readJson, route } from "@/lib/http";

/** A name is shown as typed, so markup like <i>…</i> is taken out rather than shown as text. */
const plainName = z
  .string()
  .max(80)
  .transform((s) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1));

const Body = z.object({ learnerName: plainName, learnerEmail: z.email().max(200) });

/** Opens an enrollment and its PayPal order, unless this learner has already paid. The price comes from the course, not this request. */
export const POST = route(async (req) => {
  const { learnerName, learnerEmail } = await readJson(req, Body);
  const paid = await resumePurchase(learnerEmail, getContext().channel);
  if (paid) return { enrollmentId: paid.id, alreadyPaid: true };
  const { enrollment, orderId } = await startPurchase(learnerName, learnerEmail, { testRun: isTestRun(req) });
  return { enrollmentId: enrollment.id, orderId };
});
