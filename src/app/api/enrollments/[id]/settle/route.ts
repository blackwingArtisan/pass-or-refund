import { z } from "zod";
import { settleReview } from "@/lib/course/attempts";
import { viewEnrollment } from "@/lib/course/enrollments";
import { getContext } from "@/lib/events/bus";
import { requireTeam } from "@/lib/course/team-access";
import { readJson, route } from "@/lib/http";

const Body = z.object({ outcome: z.enum(["pass", "fail"]), note: z.string().trim().min(1).max(500), checkedItems: z.array(z.string().max(20)).max(50) });

/** A person on the course team settles a 69-70 attempt. */
export const POST = route<RouteContext<"/api/enrollments/[id]/settle">>(async (req, ctx) => {
  requireTeam(req);
  const decision = await readJson(req, Body);
  return viewEnrollment(settleReview((await ctx.params).id, { ...decision, by: "course team" }, getContext().channel));
});
