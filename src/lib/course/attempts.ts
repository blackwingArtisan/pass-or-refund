/** Taking the final check: grade it, record it, and let the policy decide what happens next. */
import { getAuditLog } from "@/lib/agent/audit";
import { isOutOfAiCredit, RateLimitedError } from "@/lib/ai/errors";
import { gradeAttempt, type GradeOnce } from "@/lib/grading/grade";
import { HttpError } from "@/lib/http";
import { activeGrading, guaranteeFor, requireEnrollment, saveEnrollment } from "./enrollments";
import { missedItems, nearCopyOf, nextAttemptOpensAt, shortfallItems } from "./policy";
import { requestRefund } from "./refund";
import { lockedRubric } from "./rubric-lock";
import type { Attempt, Enrollment, EnrollmentStatus, ReviewDecision } from "./types";

const OUT_OF_CREDIT = "We've run out of AI grading credit for now, so this attempt wasn't graded. Your answers are still here and nothing was counted against you. Please try again later.";
const GRADER_DOWN = "The AI grader isn't answering right now, so this attempt wasn't graded. Your answers are still here and nothing was counted against you. Please try again in a few minutes.";

/** Why grading stopped, in words a learner can act on. Nothing was recorded, so a retry is safe. */
function gradingProblem(error: unknown): unknown {
  if (error instanceof RateLimitedError || error instanceof HttpError) return error;
  if (isOutOfAiCredit(error)) return new HttpError(402, OUT_OF_CREDIT, "ai_credit");
  console.error("[grading]", error instanceof Error ? error.message : error);
  return new HttpError(503, GRADER_DOWN, "ai_unavailable");
}

/** A refund that falls due stays "active" here; requestRefund then moves it to refund_pending. */
function statusAfter(attempt: Attempt): EnrollmentStatus {
  if (attempt.outcome === "pass") return "passed";
  return attempt.outcome === "review" ? "under_review" : "active";
}

function latestFail(enrollment: Enrollment): Attempt {
  const latest = enrollment.attempts.at(-1);
  if (enrollment.status !== "active" || latest?.outcome !== "fail") throw new HttpError(409, "There's no study list to review right now.", "conflict");
  return latest;
}

/** The learner works through their study list one item at a time. */
export function tickStudyItem(id: string, itemId: string): Enrollment {
  const enrollment = requireEnrollment(id);
  if (!missedItems(latestFail(enrollment)).some((item) => item.id === itemId)) throw new HttpError(422, "That isn't on your study list.", "rule");
  return saveEnrollment({ ...enrollment, studyTicks: [...new Set([...(enrollment.studyTicks ?? []), itemId])] });
}

/** The learner says they worked through the study list from their latest attempt. It takes every item. */
export function markStudyListReviewed(id: string): Enrollment {
  const enrollment = requireEnrollment(id);
  const latest = latestFail(enrollment);
  const ticks = enrollment.studyTicks ?? [];
  const left = missedItems(latest).filter((item) => !ticks.includes(item.id));
  if (left.length > 0) throw new HttpError(409, `${left.length} study list ${left.length === 1 ? "item is" : "items are"} still to review.`, "conflict");
  return saveEnrollment({ ...enrollment, reviewedAttempt: latest.number });
}

/** Demo sites let anyone skip the wait, so a judge can fail twice in one sitting. It goes in the audit log. */
export function skipAttemptGap(id: string): Enrollment {
  const enrollment = requireEnrollment(id);
  const latest = latestFail(enrollment);
  getAuditLog().append({ action: "attempt.wait_skipped", actor: "learner", reason: `Skipped the wait after attempt ${latest.number} of ${enrollment.id}` });
  return saveEnrollment({ ...enrollment, gapSkippedAfter: latest.number });
}

export async function submitAttempt(id: string, input: Record<string, string>, channel: string, grade?: GradeOnce): Promise<Enrollment> {
  const before = requireEnrollment(id);
  if (before.status !== "active") throw new HttpError(409, "This enrollment isn't open for another attempt.", "conflict");
  if (activeGrading().has(id)) throw new HttpError(409, "This attempt is already being graded.", "conflict");
  const opensAt = nextAttemptOpensAt(before.attempts, before.gapSkippedAfter);
  if (opensAt) throw new HttpError(409, `Your next attempt opens at ${opensAt}.`, "attempt_gap");
  const rubric = lockedRubric(before);
  const answers = Object.fromEntries(rubric.questions.map((q) => [q.id, (input[q.id] ?? "").trim()]));
  if (Object.values(answers).every((a) => a === "")) throw new HttpError(422, "Answer at least one question first.", "rule");

  activeGrading().add(id);
  try {
    const number = before.attempts.length + 1;
    const previous = before.attempts.at(-1);
    const reviewedStudyList = !previous || before.reviewedAttempt === previous.number || missedItems(previous).length === 0;
    const graded = await gradeAttempt(answers, `attempt ${number}`, grade, rubric).catch((error) => {
      throw gradingProblem(error);
    });
    const attempt: Attempt = { ...graded, number, submittedAt: new Date().toISOString(), answers, reviewedStudyList, nearCopyOf: nearCopyOf(answers, before.attempts) };
    const attempts = [...before.attempts, attempt];
    const now = requireEnrollment(id);
    // Taking the retake withdraws a contest nobody has ruled on yet.
    const contest = now.contest && !now.contest.ruling && !now.contest.withdrawnAt ? { ...now.contest, withdrawnAt: attempt.submittedAt } : now.contest;
    const saved = saveEnrollment({ ...now, attempts, status: statusAfter(attempt), studyTicks: [], contest });
    return attempt.outcome === "fail" && guaranteeFor(saved).due ? requestRefund(saved, channel).enrollment : saved;
  } finally {
    activeGrading().delete(id);
  }
}

/**
 * A person settles a 69-70 attempt. They go through every item that lost points before they can
 * decide. A fail then counts like any other: a second one sends the refund to the same approval.
 */
export function settleReview(id: string, decision: Pick<ReviewDecision, "outcome" | "note" | "checkedItems" | "by">, channel: string): Enrollment {
  const enrollment = requireEnrollment(id);
  const latest = enrollment.attempts.at(-1);
  if (enrollment.status !== "under_review" || latest?.outcome !== "review") throw new HttpError(409, "There's no attempt waiting for a person here.", "conflict");
  const left = shortfallItems(latest).filter((item) => !decision.checkedItems.includes(item.id));
  if (left.length > 0) throw new HttpError(409, `${left.length} rubric ${left.length === 1 ? "item is" : "items are"} still to check.`, "conflict");

  const settled: ReviewDecision = { ...decision, at: new Date().toISOString() };
  const attempt: Attempt = { ...latest, outcome: decision.outcome, settled };
  const saved = saveEnrollment({ ...enrollment, attempts: [...enrollment.attempts.slice(0, -1), attempt], status: statusAfter(attempt) });
  getAuditLog().append({ action: "review.settled", actor: decision.by, reason: `${decision.outcome} on attempt ${attempt.number} of ${id} at ${attempt.score}: ${decision.note}` });
  return decision.outcome === "fail" && guaranteeFor(saved).due ? requestRefund(saved, channel).enrollment : saved;
}
