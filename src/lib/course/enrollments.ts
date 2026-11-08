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
import { lockRubric } from "./rubric-lock";
import { checkGuarantee, completedFails, guaranteeVoid, learnerKey, nextAttemptOpensAt, sameLearner } from "./policy";
import { overdueFor } from "./overdue";
import { isSampleId } from "./sample-ids";
import type { Enrollment, EnrollmentStatus, EnrollmentView, GuaranteeDecision, PendingApproval } from "./types";

const enrollments = () => collection<Enrollment>("enrollments");

/** Work running in this process. A pending approval dies with the process. */
export const activeRefunds = () => singleton("course:active-refunds", () => new Set<string>());
export const activeGrading = () => singleton("course:active-grading", () => new Set<string>());

export function createEnrollment(learnerName: string, learnerEmail: string, opts: { testRun?: boolean } = {}): Enrollment {
  return enrollments().upsert({
    id: `en_${randomUUID().slice(0, 8)}`,
    learnerName,
    learnerEmail,
    courseSlug: course.slug,
    status: "unpaid",
    createdAt: new Date().toISOString(),
    priceCents: COURSE_PRICE_CENTS,
    attempts: [],
    ...(opts.testRun ? { testRun: true } : {}),
    // The terms the learner sees at checkout are the ones they're graded on.
    rubric: lockRubric(),
  });
}

export const enrollmentIfAny = (id: string): Enrollment | undefined => enrollments().get(id);

export function requireEnrollment(id: string): Enrollment {
  const enrollment = enrollments().get(id);
  if (!enrollment) throw new HttpError(404, `Enrollment ${id} not found`, "not_found");
  return enrollment;
}

/** The enrollment a PayPal id belongs to: its order, its capture or its refund. */
export function enrollmentForPayPalId(ids: { orderId?: string; captureId?: string; refundId?: string }): Enrollment | undefined {
  return enrollments()
    .list()
    .find((e) => (ids.orderId && e.payment?.orderId === ids.orderId) || (ids.captureId && e.payment?.captureId === ids.captureId) || (ids.refundId && e.refund?.refundId === ids.refundId));
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

/**
 * PayPal paid a refund and our record never heard, because the app stopped in between. The order
 * lists its refunds, so the record is rebuilt from PayPal and nothing is paid again.
 */
export async function recoverRefund(enrollment: Enrollment, paypal: PayPalApi): Promise<Enrollment> {
  const { id, status, refund, payment } = enrollment;
  if ((status !== "refund_pending" && status !== "refund_blocked") || refund?.refundId || !payment?.orderId || activeRefunds().has(id)) return enrollment;
  const order = await paypal.orders.get(payment.orderId);
  const paid = order.purchase_units?.[0]?.payments?.refunds?.[0];
  if (!paid) return enrollment;
  saveEnrollment({ ...enrollment, status: "refunded", refund: { ...refund!, error: undefined, refundId: paid.id, refundStatus: paid.status, refundedCents: toMinor(paid.amount.value, paid.amount.currency_code) } });
  return readBackRefund(id, paypal);
}

const PENDING_REREAD_MS = 30_000;

/**
 * A PENDING refund settles on PayPal's side later, so a learner looking at it asks PayPal again.
 * So does one we never got to read back, because the screens show PayPal's word, not ours.
 */
export async function withSettledRefund(enrollment: Enrollment): Promise<Enrollment> {
  const { refund } = enrollment;
  if (enrollment.status !== "refunded" || !refund?.refundId) return enrollment;
  if (refund.rereadAt && refund.refundStatus !== "PENDING") return enrollment;
  if (Date.now() - Date.parse(refund.rereadAt ?? "0") < PENDING_REREAD_MS) return enrollment;
  return readBackRefund(enrollment.id, getPayPal()).catch(() => enrollment);
}

/** Unpaid checkouts this learner started, newest first. PayPal may already have paid one of them. */
export function unpaidFor(learnerEmail: string): Enrollment[] {
  const key = learnerKey(learnerEmail, course.slug);
  return enrollments()
    .list()
    .filter((e) => e.status === "unpaid" && e.payment?.orderId && learnerKey(e.learnerEmail, e.courseSlug) === key)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * A payment PayPal took that we rebuilt from PayPal (a webhook or a reload did it), which the
 * learner hasn't started on. Buying again takes them back to it rather than charging twice.
 */
export function recoveredUnstartedFor(learnerEmail: string): Enrollment | undefined {
  const key = learnerKey(learnerEmail, course.slug);
  return enrollments()
    .list()
    .filter((e) => e.status === "active" && e.payment?.recovered && e.attempts.length === 0 && learnerKey(e.learnerEmail, e.courseSlug) === key)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** A blocked or declined refund moved no money, so it doesn't use up the learner's one refund. */
const USES_THE_REFUND: EnrollmentStatus[] = ["refund_pending", "refund_review", "refunded"];

/** The policy for this enrollment, including what the learner's other purchases of the course say. */
export function guaranteeFor(enrollment: Enrollment): GuaranteeDecision {
  const priorRefund = enrollments()
    .list()
    .some((other) => other.id !== enrollment.id && USES_THE_REFUND.includes(other.status) && sameLearner(other, enrollment));
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
  // PayPal's email for the buyer is only for matching one refund per payer: it never leaves the server.
  // So is the email the learner typed: no screen needs it.
  const { learnerEmail, ...shown } = enrollment;
  void learnerEmail;
  const payment = enrollment.payment ? { ...enrollment.payment, payerEmail: undefined } : undefined;
  return { ...shown, payment, approval: pendingApproval(enrollment), completedFails: completedFails(enrollment.attempts), guaranteeVoid: guaranteeVoid(enrollment.attempts), guarantee: guaranteeFor(enrollment), nextAttemptAt: nextAttemptOpensAt(enrollment.attempts, enrollment.gapSkippedAfter), overdue: overdueFor(enrollment) };
}

/** Paid enrollments, newest first. Test-suite buyers are left out unless asked for. */
export function listEnrollments(opts: { includeTestRuns?: boolean } = {}): EnrollmentView[] {
  return enrollments()
    .list()
    .filter((e) => e.status !== "unpaid" && !isSampleId(e.id) && (opts.includeTestRuns || !e.testRun))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(viewEnrollment);
}
