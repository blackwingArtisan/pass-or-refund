import { route, withoutEmails } from "@/lib/http";
import { getApprovals, type Approval } from "@/lib/agent/approvals";
import { getContext } from "@/lib/events/bus";
import { requireTeam } from "@/lib/course/team-access";

export const GET = route(async (req) => {
  requireTeam(req);
  const state = (req.nextUrl.searchParams.get("state") as Approval["state"] | null) ?? undefined;
  return { approvals: withoutEmails(getApprovals().list({ state, channel: getContext().channel })) };
});
