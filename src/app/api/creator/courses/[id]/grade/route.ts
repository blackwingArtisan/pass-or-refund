import { z } from "zod";
import { gradeCreatorAttempt } from "@/lib/course/creator-courses";
import { MAX_ANSWER_CHARS } from "@/lib/course/policy";
import { readJson, route } from "@/lib/http";

const Body = z.object({ answers: z.record(z.string().max(8), z.string().max(MAX_ANSWER_CHARS)) });

/** A practice attempt on a creator's course, graded against the rubric with the fingerprint in its link. */
export const POST = route<RouteContext<"/api/creator/courses/[id]/grade">>(
  async (req, { params }) => {
    const { answers } = await readJson(req, Body);
    return gradeCreatorAttempt((await params).id, answers);
  },
  { rateLimit: "ai" },
);
