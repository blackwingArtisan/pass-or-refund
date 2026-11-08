import { route } from "@/lib/http";
import { webhookTrail } from "@/lib/paypal/webhook-trail";

/** The last webhook deliveries and what this server did with each, for checking a webhook that seems missing. */
export const GET = route(async () => ({ deliveries: webhookTrail() }));
