import { skipAttemptGap } from "@/lib/course/attempts";
import { viewEnrollment } from "@/lib/course/enrollments";
import { route } from "@/lib/http";

/** The demo's way past the wait between attempts, so a judge can fail twice in one sitting. */
export const POST = route<RouteContext<"/api/enrollments/[id]/skip-wait">>(async (_req, ctx) => viewEnrollment(skipAttemptGap((await ctx.params).id)));
