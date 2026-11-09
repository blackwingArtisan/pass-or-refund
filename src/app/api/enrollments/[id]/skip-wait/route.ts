import { requireLearnerAction, viewFor } from "@/lib/course/learner-access";
import { skipAttemptGap } from "@/lib/course/attempts";
import { route } from "@/lib/http";

/** The demo's way past the wait between attempts, so a judge can fail twice in one sitting. */
export const POST = route<RouteContext<"/api/enrollments/[id]/skip-wait">>(async (req, ctx) => {
  const { id } = await ctx.params;
  requireLearnerAction(req, id);
  return viewFor(req, skipAttemptGap(id));
});
