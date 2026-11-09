import { requireEnrollment } from "@/lib/course/enrollments";
import { viewFor } from "@/lib/course/learner-access";
import { caughtUpWithPayPal } from "@/lib/course/recovery";
import { SAMPLE_PASS_ID } from "@/lib/course/sample-ids";
import { ensureSamplePass } from "@/lib/course/sample-pass";
import { route } from "@/lib/http";

/** In full for the learner's own browser and the course team; anyone else with the id gets status and scores. */
export const GET = route<RouteContext<"/api/enrollments/[id]">>(async (req, ctx) => {
  const { id } = await ctx.params;
  // The passing sample learner is made on first view, so the home page's link always works.
  if (id === SAMPLE_PASS_ID) return viewFor(req, ensureSamplePass());
  return viewFor(req, await caughtUpWithPayPal(requireEnrollment(id)));
});
