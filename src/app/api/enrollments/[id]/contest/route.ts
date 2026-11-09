import { z } from "zod";
import { contestLine } from "@/lib/course/contest";
import { readContest } from "@/lib/course/contest-reader";
import { CONTEST_NOTE_MAX } from "@/lib/course/contest-rules";
import { viewEnrollment } from "@/lib/course/enrollments";
import { readJson, route } from "@/lib/http";

const Body = z.object({ itemId: z.string().min(1).max(20), note: z.string().trim().min(1).max(CONTEST_NOTE_MAX) });

/**
 * The learner contests one rubric line from their first attempt, once, before the retake. Claude's
 * second reading for the course team follows in the background; it never throws.
 */
export const POST = route<RouteContext<"/api/enrollments/[id]/contest">>(async (req, ctx) => {
  const { itemId, note } = await readJson(req, Body);
  const saved = contestLine((await ctx.params).id, itemId, note);
  void readContest(saved.id);
  return viewEnrollment(saved);
});
