import { requireLearnerAction, viewFor } from "@/lib/course/learner-access";
import { z } from "zod";
import { contestLine } from "@/lib/course/contest";
import { readContest } from "@/lib/course/contest-reader";
import { CONTEST_NOTE_MAX } from "@/lib/course/contest-rules";
import { readJson, route } from "@/lib/http";

const Body = z.object({ itemId: z.string().min(1).max(20), note: z.string().trim().min(1).max(CONTEST_NOTE_MAX) });

/**
 * The learner contests one rubric line from their first attempt, once, before the retake. Claude's
 * second reading for the course team follows in the background; it never throws.
 */
export const POST = route<RouteContext<"/api/enrollments/[id]/contest">>(async (req, ctx) => {
  const { id } = await ctx.params;
  requireLearnerAction(req, id);
  const { itemId, note } = await readJson(req, Body);
  const saved = contestLine(id, itemId, note);
  void readContest(saved.id);
  return viewFor(req, saved);
});
