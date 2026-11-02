import { markStudyListReviewed } from "@/lib/course/attempts";
import { viewEnrollment } from "@/lib/course/enrollments";
import { route } from "@/lib/http";

/** The learner marks their study list as reviewed, so their next attempt can count toward a refund. */
export const POST = route<RouteContext<"/api/enrollments/[id]/review">>(async (_req, ctx) => viewEnrollment(markStudyListReviewed((await ctx.params).id)));
