import { requireEnrollment, viewEnrollment, withSettledRefund } from "@/lib/course/enrollments";
import { route } from "@/lib/http";

export const GET = route<RouteContext<"/api/enrollments/[id]">>(async (_req, ctx) => viewEnrollment(await withSettledRefund(requireEnrollment((await ctx.params).id))));
