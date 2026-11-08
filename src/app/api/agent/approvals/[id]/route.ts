import { z } from "zod";
import { readJson, route } from "@/lib/http";
import { getApprovals } from "@/lib/agent/approvals";
import { requireTeam } from "@/lib/course/team-access";

const Body = z.object({ decision: z.enum(["approved", "denied"]), note: z.string().max(500).optional() });

/** The course team's answer to a pending approval. Only a browser that entered the team passcode can give it. */
export const POST = route<RouteContext<"/api/agent/approvals/[id]">>(async (req, ctx) => {
  requireTeam(req);
  const b = await readJson(req, Body);
  return { approval: getApprovals().decide((await ctx.params).id, b.decision, "course team", b.note) };
});
