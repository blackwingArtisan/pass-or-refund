import { viewEnrollment } from "@/lib/course/enrollments";
import { retryRefund } from "@/lib/course/refund";
import { getContext } from "@/lib/events/bus";
import { route } from "@/lib/http";

/** Sends a blocked refund back to the approval gate. No money moves until it is approved. */
export const POST = route<RouteContext<"/api/enrollments/[id]/refund">>(async (_req, ctx) => viewEnrollment(retryRefund((await ctx.params).id, getContext().channel).enrollment));
