/** Taking the final check: grade it, record it, and let the policy decide what happens next. */
import { gradeAttempt, type GradeOnce } from "@/lib/grading/grade";
import { HttpError } from "@/lib/http";
import { rubric } from "./content";
import { activeGrading, guaranteeFor, requireEnrollment, saveEnrollment } from "./enrollments";
import { requestRefund } from "./refund";
import type { Attempt, Enrollment, EnrollmentStatus } from "./types";

/** A refund that falls due stays "active" here; requestRefund then moves it to refund_pending. */
function statusAfter(attempt: Attempt): EnrollmentStatus {
  if (attempt.outcome === "pass") return "passed";
  return attempt.outcome === "review" ? "under_review" : "active";
}

const missedItems = (attempt: Attempt) => attempt.runs[attempt.shownRun].items.filter((item) => item.verdict === "not_met");

/** The learner says they worked through the study list from their latest attempt. */
export function markStudyListReviewed(id: string): Enrollment {
  const enrollment = requireEnrollment(id);
  const latest = enrollment.attempts.at(-1);
  if (enrollment.status !== "active" || latest?.outcome !== "fail") throw new HttpError(409, "There's no study list to review right now.", "conflict");
  return saveEnrollment({ ...enrollment, reviewedAttempt: latest.number });
}

export async function submitAttempt(id: string, input: Record<string, string>, channel: string, grade?: GradeOnce): Promise<Enrollment> {
  const before = requireEnrollment(id);
  if (before.status !== "active") throw new HttpError(409, "This enrollment isn't open for another attempt.", "conflict");
  if (activeGrading().has(id)) throw new HttpError(409, "This attempt is already being graded.", "conflict");
  const answers = Object.fromEntries(rubric.questions.map((q) => [q.id, (input[q.id] ?? "").trim()]));
  if (Object.values(answers).every((a) => a === "")) throw new HttpError(422, "Answer at least one question first.", "rule");

  activeGrading().add(id);
  try {
    const number = before.attempts.length + 1;
    const previous = before.attempts.at(-1);
    const reviewedStudyList = !previous || before.reviewedAttempt === previous.number || missedItems(previous).length === 0;
    const graded = await gradeAttempt(answers, `attempt ${number}`, grade);
    const attempt: Attempt = { ...graded, number, submittedAt: new Date().toISOString(), answers, reviewedStudyList };
    const attempts = [...before.attempts, attempt];
    const saved = saveEnrollment({ ...requireEnrollment(id), attempts, status: statusAfter(attempt) });
    return attempt.outcome === "fail" && guaranteeFor(saved).due ? requestRefund(saved, channel).enrollment : saved;
  } finally {
    activeGrading().delete(id);
  }
}
