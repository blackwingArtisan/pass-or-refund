import { z } from "zod";
import { markStudyListReviewed, tickStudyItem } from "@/lib/course/attempts";
import { viewEnrollment } from "@/lib/course/enrollments";
import { readJson, route } from "@/lib/http";

const Body = z.object({ item: z.string().min(1).max(20).optional() });

/**
 * The learner's study list. Sent with an item, it ticks that one off. Sent without, it marks the
 * list as reviewed, which takes every item, so their next attempt can count toward a refund.
 */
export const POST = route<RouteContext<"/api/enrollments/[id]/review">>(async (req, ctx) => {
  const { item } = await readJson(req, Body);
  const { id } = await ctx.params;
  return viewEnrollment(item ? tickStudyItem(id, item) : markStudyListReviewed(id));
});
