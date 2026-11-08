import { z } from "zod";
import { ruleOnContest } from "@/lib/course/contest";
import { viewEnrollment } from "@/lib/course/enrollments";
import { readJson, route } from "@/lib/http";
import { requireTeam } from "@/lib/course/team-access";

const Body = z.object({ upheld: z.boolean(), note: z.string().trim().min(1).max(500) });

/** A person on the course team rules on a contested rubric line. */
export const POST = route<RouteContext<"/api/enrollments/[id]/contest/ruling">>(async (req, ctx) => {
  requireTeam(req);
  const decision = await readJson(req, Body);
  return viewEnrollment(ruleOnContest((await ctx.params).id, { ...decision, by: "course team" }));
});
