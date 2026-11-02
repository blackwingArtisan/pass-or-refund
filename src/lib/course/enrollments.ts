/** Enrollment records, kept in the kit's JSON store. Server only. */
import { randomUUID } from "node:crypto";
import { getApprovals } from "@/lib/agent/approvals";
import { HttpError } from "@/lib/http";
import { singleton } from "@/lib/singleton";
import { collection } from "@/lib/store/collection";
import { COURSE_PRICE_CENTS } from "./content";
import { completedFails, guaranteeVoid } from "./policy";
import type { Enrollment, EnrollmentView, PendingApproval } from "./types";

const enrollments = () => collection<Enrollment>("enrollments");

/** Work running in this process. A pending approval dies with the process. */
export const activeRefunds = () => singleton("course:active-refunds", () => new Set<string>());
export const activeGrading = () => singleton("course:active-grading", () => new Set<string>());

export function createEnrollment(learnerName: string): Enrollment {
  return enrollments().upsert({
    id: `en_${randomUUID().slice(0, 8)}`,
    learnerName,
    status: "unpaid",
    createdAt: new Date().toISOString(),
    priceCents: COURSE_PRICE_CENTS,
    attempts: [],
  });
}

export function requireEnrollment(id: string): Enrollment {
  const enrollment = enrollments().get(id);
  if (!enrollment) throw new HttpError(404, `Enrollment ${id} not found`, "not_found");
  return enrollment;
}

export function saveEnrollment(enrollment: Enrollment): Enrollment {
  return enrollments().upsert(enrollment);
}

function pendingApproval(enrollment: Enrollment): PendingApproval | null {
  const runId = enrollment.refund?.runId;
  const pending = runId ? getApprovals().list({ runId, state: "pending" })[0] : undefined;
  return pending ? { id: pending.id, summary: pending.summary, reason: pending.reason, amountValue: pending.amount?.value } : null;
}

export function viewEnrollment(input: Enrollment): EnrollmentView {
  let enrollment = input;
  // The server restarted while the course team was deciding: no money moved, so ask again.
  if (enrollment.status === "refund_pending" && !activeRefunds().has(enrollment.id)) {
    enrollment = saveEnrollment({ ...enrollment, status: "refund_blocked", refund: { ...enrollment.refund!, error: "The approval was lost when the server restarted. Request it again." } });
  }
  return { ...enrollment, approval: pendingApproval(enrollment), completedFails: completedFails(enrollment.attempts), guaranteeVoid: guaranteeVoid(enrollment.attempts) };
}

export function listEnrollments(): EnrollmentView[] {
  return enrollments()
    .list()
    .filter((e) => e.status !== "unpaid")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(viewEnrollment);
}
