import { requireTeam } from "@/lib/course/team-access";
import { route } from "@/lib/http";
import { webhookTrail } from "@/lib/paypal/webhook-trail";

/** The last webhook deliveries and what this server did with each, for checking a webhook that seems missing. Course team only. */
export const GET = route(async (req) => {
  requireTeam(req);
  return { deliveries: webhookTrail() };
});
