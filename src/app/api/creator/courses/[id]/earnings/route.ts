import { readCourseEarnings } from "@/lib/course/course-earnings";
import { isTestRun } from "@/lib/course/team-access";
import { route } from "@/lib/http";

/** What a course earned, read back from PayPal just now: sold, refunded, net and the refund rate. `sample` is the sample course. */
export const GET = route<RouteContext<"/api/creator/courses/[id]/earnings">>(async (req, { params }) => readCourseEarnings((await params).id, { includeTestRuns: isTestRun(req) }));
