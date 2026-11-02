import { requireEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { route } from "@/lib/http";

export const GET = route<RouteContext<"/api/enrollments/[id]">>(async (_req, ctx) => viewEnrollment(requireEnrollment((await ctx.params).id)));
