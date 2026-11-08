import { z } from "zod";
import { viewEnrollment } from "@/lib/course/enrollments";
import { decideReview } from "@/lib/course/refund";
import { requireTeam } from "@/lib/course/team-access";
import { getContext } from "@/lib/events/bus";
import { readJson, route } from "@/lib/http";

const Body = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("propose"), note: z.string().max(500).default("") }),
  z.object({ decision: z.literal("decline"), note: z.string().trim().min(1, "Say why, for the learner.").max(500) }),
]);

/** The course team decides a case the refund agent sent to them first. Proposing still stops at the approval gate. */
export const POST = route<RouteContext<"/api/enrollments/[id]/refund/review">>(async (req, ctx) => {
  requireTeam(req);
  const { decision, note } = await readJson(req, Body);
  return viewEnrollment(decideReview((await ctx.params).id, decision, note, getContext().channel).enrollment);
});
