import { z } from "zod";
import { viewEnrollment } from "@/lib/course/enrollments";
import { completePurchase } from "@/lib/course/purchase";
import { getContext } from "@/lib/events/bus";
import { readJson, route } from "@/lib/http";

const Body = z.object({ orderId: z.string().min(5) });

/** Takes the payment the learner approved in PayPal. */
export const POST = route<RouteContext<"/api/enrollments/[id]/pay">>(async (req, ctx) => {
  const { orderId } = await readJson(req, Body);
  return viewEnrollment(await completePurchase((await ctx.params).id, orderId, getContext().channel));
});
