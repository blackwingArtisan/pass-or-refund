import { z } from "zod";
import { rubric } from "@/lib/course/content";
import { submitAttempt } from "@/lib/course/attempts";
import { viewEnrollment } from "@/lib/course/enrollments";
import { MAX_ANSWER_CHARS } from "@/lib/course/policy";
import { getContext } from "@/lib/events/bus";
import { readJson, route } from "@/lib/http";

const Body = z.object({ answers: z.object(Object.fromEntries(rubric.questions.map((q) => [q.id, z.string().max(MAX_ANSWER_CHARS)]))) });

/** Grades one attempt. A second completed fail sends the refund to the approval gate. */
export const POST = route<RouteContext<"/api/enrollments/[id]/attempts">>(
  async (req, ctx) => {
    const { answers } = await readJson(req, Body);
    return viewEnrollment(await submitAttempt((await ctx.params).id, answers as Record<string, string>, getContext().channel));
  },
  { rateLimit: "ai" },
);
