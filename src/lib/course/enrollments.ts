/** Enrollment records, kept in the kit's JSON store. Server only. */
import { randomUUID } from "node:crypto";
import { getApprovals } from "@/lib/agent/approvals";
import { HttpError } from "@/lib/http";
import { toMinor } from "@/lib/money";
import { getPayPal } from "@/lib/paypal";
import type { PayPalApi } from "@/lib/paypal/api";
import { singleton } from "@/lib/singleton";
import { collection } from "@/lib/store/collection";
import { course, COURSE_PRICE_CENTS } from "./content";
import { checkGuarantee, completedFails, guaranteeVoid, learnerKey } from "./policy";
import type { Enrollment, EnrollmentStatus, EnrollmentView, GuaranteeDecision, PendingApproval } from "./types";

const enrollments = () => collection<Enrollment>("enrollments");

/** Work running in this process. A pending approval dies with the process. */
export const activeRefunds = () => singleton("course:active-refunds", () => new Set<string>());
export const activeGrading = () => singleton("course:active-grading", () => new Set<string>());

export function createEnrollment(learnerName: string, learnerEmail: string): Enrollment {
  return enrollments().upsert({
    id: `en_${randomUUID().slice(0, 8)}`,
    learnerName,
    learnerEmail,
    courseSlug: course.slug,
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

/** What PayPal says about the refund now. The screens show this, not what we asked for. */
export async function readBackRefund(id: string, paypal: PayPalApi): Promise<Enrollment> {
  const { refund, payment } = requireEnrollment(id);
  const paid = await paypal.payments.getRefund(refund!.refundId!);
  const capture = await paypal.payments.getCapture(payment!.captureId!);
  const enrollment = requireEnrollment(id);
  return saveEnrollment({
    ...enrollment,
    refund: { ...enrollment.refund!, refundStatus: paid.status, refundStatusReason: paid.status_details?.reason, refundedCents: toMinor(paid.amount.value, paid.amount.currency_code), captureStatus: capture.status, rereadAt: new Date().toISOString() },
  });
}

const PENDING_REREAD_MS = 30_000;

/** A PENDING refund settles on PayPal's side later, so a learner looking at it asks PayPal again. */
export async function withSettledRefund(enrollment: Enrollment): Promise<Enrollment> {
  const { refund } = enrollment;
  if (enrollment.status !== "refunded" || refund?.refundStatus !== "PENDING") return enrollment;
  if (Date.now() - Date.parse(refund.rereadAt ?? "0") < PENDING_REREAD_MS) return enrollment;
  return readBackRefund(enrollment.id, getPayPal()).catch(() => enrollment);
}

/** A blocked or declined refund moved no money, so it doesn't use up the learner's one refund. */
const USES_THE_REFUND: EnrollmentStatus[] = ["refund_pending", "refunded"];

/** The policy for this enrollment, including what the learner's other purchases of the course say. */
export function guaranteeFor(enrollment: Enrollment): GuaranteeDecision {
  const key = learnerKey(enrollment.learnerEmail, enrollment.courseSlug);
  const priorRefund = enrollments()
    .list()
    .some((other) => other.id !== enrollment.id && USES_THE_REFUND.includes(other.status) && learnerKey(other.learnerEmail, other.courseSlug) === key);
  return checkGuarantee(enrollment.attempts, priorRefund);
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
  return { ...enrollment, approval: pendingApproval(enrollment), completedFails: completedFails(enrollment.attempts), guaranteeVoid: guaranteeVoid(enrollment.attempts), guarantee: guaranteeFor(enrollment) };
}

export function listEnrollments(): EnrollmentView[] {
  return enrollments()
    .list()
    .filter((e) => e.status !== "unpaid")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(viewEnrollment);
}
