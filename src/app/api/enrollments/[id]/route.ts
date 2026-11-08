import { requireEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { caughtUpWithPayPal } from "@/lib/course/recovery";
import { SAMPLE_PASS_ID } from "@/lib/course/sample-ids";
import { ensureSamplePass } from "@/lib/course/sample-pass";
import { route } from "@/lib/http";

export const GET = route<RouteContext<"/api/enrollments/[id]">>(async (_req, ctx) => {
  const { id } = await ctx.params;
  // The passing sample learner is made on first view, so the home page's link always works.
  if (id === SAMPLE_PASS_ID) return viewEnrollment(ensureSamplePass());
  return viewEnrollment(await caughtUpWithPayPal(requireEnrollment(id)));
});
