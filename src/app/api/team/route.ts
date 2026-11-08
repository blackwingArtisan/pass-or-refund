import { listEnrollments } from "@/lib/course/enrollments";
import { isTestRun, requireTeam } from "@/lib/course/team-access";
import { route } from "@/lib/http";

/** The course team's list. A test suite sees its own learners; everyone else doesn't. */
export const GET = route(async (req) => {
  requireTeam(req);
  return { enrollments: listEnrollments({ includeTestRuns: isTestRun(req) }) };
});
