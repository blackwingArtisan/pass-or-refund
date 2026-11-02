import { requireEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { caughtUpWithPayPal } from "@/lib/course/recovery";
import { route } from "@/lib/http";

export const GET = route<RouteContext<"/api/enrollments/[id]">>(async (_req, ctx) => viewEnrollment(await caughtUpWithPayPal(requireEnrollment((await ctx.params).id))));
