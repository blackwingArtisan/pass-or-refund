import { route } from "@/lib/http";
import { getAuditLog } from "@/lib/agent/audit";
import { requireTeam } from "@/lib/course/team-access";

/**
 * Append-only audit log + hash-chain verification, for the course team. The chain is verified
 * here on the full lines; the screen gets what it shows, so tool inputs and PayPal's replies
 * (with payer details) stay on the server.
 */
export const GET = route(async (req) => {
  requireTeam(req);
  const log = getAuditLog();
  const runId = req.nextUrl.searchParams.get("runId") ?? undefined;
  const entries = log.list({ runId, limit: 500 }).reverse();
  return {
    entries: entries.map(({ seq, ts, action, actor, runId: run, tool, amount, reason, hash }) => ({ seq, ts, action, actor, runId: run, tool, amount, reason, hash })),
    integrity: log.verify(),
  };
});
