import { z } from "zod";
import { submitAttempt } from "@/lib/course/attempts";
import { viewEnrollment } from "@/lib/course/enrollments";
import { MAX_ANSWER_CHARS } from "@/lib/course/policy";
import { getContext } from "@/lib/events/bus";
import { readJson, route } from "@/lib/http";

/** Answers by question id: the sample course's four, or up to a creator's six. Grading keeps only the questions the course asks. */
const Body = z.object({ answers: z.record(z.string().regex(/^q[1-9]$/), z.string().max(MAX_ANSWER_CHARS)) });

/** Grades one attempt. A second completed fail sends the refund to the approval gate. */
export const POST = route<RouteContext<"/api/enrollments/[id]/attempts">>(
  async (req, ctx) => {
    const { answers } = await readJson(req, Body);
    return viewEnrollment(await submitAttempt((await ctx.params).id, answers as Record<string, string>, getContext().channel));
  },
  { rateLimit: "ai" },
);
