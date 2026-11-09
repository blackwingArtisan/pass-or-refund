import { cohortResponse } from "@/lib/course/cohort-response";
import { isTestRun } from "@/lib/course/team-access";
import { route } from "@/lib/http";

export const GET = route(async (req) => cohortResponse({ includeTestRuns: isTestRun(req) }));
