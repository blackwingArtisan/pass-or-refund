import { HttpError, route } from "@/lib/http";
import { getRun } from "@/lib/agent/runs";
import { requireTeam } from "@/lib/course/team-access";

export const GET = route<RouteContext<"/api/agent/runs/[id]">>(async (req, ctx) => {
  requireTeam(req);
  const run = getRun((await ctx.params).id);
  if (!run) throw new HttpError(404, "Run not found", "not_found");
  return { run };
});
