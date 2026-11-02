/** Taking the final check: grade it, record it, and let the policy decide what happens next. */
import { gradeAttempt, type GradeOnce } from "@/lib/grading/grade";
import { HttpError } from "@/lib/http";
import { rubric } from "./content";
import { activeGrading, requireEnrollment, saveEnrollment } from "./enrollments";
import { refundDue } from "./policy";
import { requestRefund } from "./refund";
import type { Attempt, Enrollment, EnrollmentStatus } from "./types";

/** A refund that falls due stays "active" here; requestRefund then moves it to refund_pending. */
function statusAfter(attempt: Attempt): EnrollmentStatus {
  if (attempt.outcome === "pass") return "passed";
  return attempt.outcome === "review" ? "under_review" : "active";
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
    const graded = await gradeAttempt(answers, `attempt ${number}`, grade);
    const attempt: Attempt = { ...graded, number, submittedAt: new Date().toISOString(), answers };
    const attempts = [...before.attempts, attempt];
    const saved = saveEnrollment({ ...requireEnrollment(id), attempts, status: statusAfter(attempt) });
    return attempt.outcome === "fail" && refundDue(attempts) ? requestRefund(saved, channel).enrollment : saved;
  } finally {
    activeGrading().delete(id);
  }
}
