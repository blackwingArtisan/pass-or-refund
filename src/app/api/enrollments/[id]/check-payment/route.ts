import { viewFor } from "@/lib/course/learner-access";
import { checkCheckout } from "@/lib/course/purchase";
import { getContext } from "@/lib/events/bus";
import { route } from "@/lib/http";

/** Asked while PayPal's window is open: has PayPal got the buyer's approval? If so, the purchase finishes. */
export const POST = route<RouteContext<"/api/enrollments/[id]/check-payment">>(async (req, ctx) => viewFor(req, await checkCheckout((await ctx.params).id, getContext().channel)));
