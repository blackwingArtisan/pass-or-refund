import { z } from "zod";
import { getApprovals } from "@/lib/agent/approvals";
import { requireEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { HttpError, readJson, route } from "@/lib/http";

/**
 * Mock mode only: this enrollment's pending refund approval runs out, as if nobody on the course
 * team had decided for `hoursAgo` hours past the deadline. The real timer does the same after an hour.
 */
export const POST = route<RouteContext<"/api/dev/mock/approval-timeout/[id]">>(
  async (req, { params }) => {
    const { id } = await params;
    const { hoursAgo } = await readJson(req, z.object({ hoursAgo: z.number().min(0).max(72).default(0) }));
    const approval = viewEnrollment(requireEnrollment(id)).approval;
    if (!approval) throw new HttpError(409, "This enrollment has no refund waiting for approval.", "conflict");
    return { approval: getApprovals().runOut(approval.id, hoursAgo) };
  },
  { mockOnly: true },
);
