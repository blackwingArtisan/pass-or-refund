import { readCourseEarnings } from "@/lib/course/course-earnings";
import { restoreIfExample } from "@/lib/course/example-creator-course";
import { isTestRun } from "@/lib/course/team-access";
import { route } from "@/lib/http";

/** What a course earned, read back from PayPal just now: sold, refunded, net and the refund rate. `sample` is the sample course. */
export const GET = route<RouteContext<"/api/creator/courses/[id]/earnings">>(async (req, { params }) => {
  const { id } = await params;
  restoreIfExample(id);
  return readCourseEarnings(id, { includeTestRuns: isTestRun(req) });
});
