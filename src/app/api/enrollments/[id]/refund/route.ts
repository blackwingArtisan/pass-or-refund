import { viewEnrollment } from "@/lib/course/enrollments";
import { retryRefund } from "@/lib/course/refund";
import { requireTeam } from "@/lib/course/team-access";
import { getContext } from "@/lib/events/bus";
import { route } from "@/lib/http";

/** The course team sends a blocked refund back to the approval gate. No money moves until it is approved. */
export const POST = route<RouteContext<"/api/enrollments/[id]/refund">>(async (req, ctx) => {
  requireTeam(req);
  return viewEnrollment((await retryRefund((await ctx.params).id, getContext().channel)).enrollment);
});
