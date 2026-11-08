import { viewEnrollment } from "@/lib/course/enrollments";
import { checkCheckout } from "@/lib/course/purchase";
import { getContext } from "@/lib/events/bus";
import { route } from "@/lib/http";

/** Asked while PayPal's window is open: has PayPal got the buyer's approval? If so, the purchase finishes. */
export const POST = route<RouteContext<"/api/enrollments/[id]/check-payment">>(async (_req, ctx) => viewEnrollment(await checkCheckout((await ctx.params).id, getContext().channel)));
