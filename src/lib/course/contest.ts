/**
 * A learner contests one rubric line before their retake, and a person on the course team rules
 * on it. Upheld means the line counts as met: the sealed scoring code adds the attempt up again
 * with that one verdict changed. Nothing else about the grade moves. Before the person rules, the
 * second reader (contest-reader.ts) may recommend a ruling; it never applies one. Server only.
 */
import { getAuditLog } from "@/lib/agent/audit";
import { answerAsShown, scoreItems } from "@/lib/grading/frozen/score-items";
import { HttpError } from "@/lib/http";
import { contestableAttempt, learnerLineText } from "./contest-rules";
import { requireEnrollment, saveEnrollment } from "./enrollments";
import { shortfallItems } from "./policy";
import { lockedRubric } from "./rubric-lock";
import type { Attempt, Contest, ContestRuling, Enrollment } from "./types";

export function contestLine(id: string, itemId: string, note: string): Enrollment {
  const enrollment = requireEnrollment(id);
  if (enrollment.contest) throw new HttpError(409, "You've already contested a line. Each purchase gets one.", "conflict");
  const attempt = contestableAttempt(enrollment);
  if (!attempt) throw new HttpError(409, "You can contest a line after a failed first attempt, before your retake.", "conflict");
  if (!shortfallItems(attempt).some((item) => item.id === itemId)) throw new HttpError(422, "You can only contest a line that lost points.", "rule");
  const contest: Contest = { attempt: attempt.number, itemId, note: note.trim(), at: new Date().toISOString() };
  getAuditLog().append({ action: "contest.opened", actor: "learner", reason: `Contested "${learnerLineText(itemId)}" on attempt ${attempt.number} of ${id}` });
  return saveEnrollment({ ...enrollment, contest });
}

/** The attempt with the contested line counted as met, added up by the sealed scoring code. */
function withLineMet(enrollment: Enrollment, attempt: Attempt, itemId: string): Attempt {
  const rubric = lockedRubric(enrollment);
  const run = attempt.runs[attempt.shownRun];
  const verdicts = run.items.map(({ id, verdict, quote }) => ({ id, verdict: id === itemId ? ("met" as const) : verdict, quote }));
  const shown = Object.fromEntries(Object.entries(attempt.answers).map(([qid, answer]) => [qid, answerAsShown(answer)]));
  const rescored = scoreItems(rubric, shown, verdicts, run.caps);
  const runs = attempt.runs.map((r, i) => (i === attempt.shownRun ? { ...r, total: rescored.total, totalQuoteChecked: rescored.totalQuoteChecked, perQuestion: rescored.perQuestion, items: rescored.items } : r));
  return { ...attempt, runs, score: rescored.total, outcome: rescored.total >= rubric.passMark ? "pass" : "fail" };
}

export function ruleOnContest(id: string, decision: { upheld: boolean; note: string; by: string }): Enrollment {
  const enrollment = requireEnrollment(id);
  const contest = enrollment.contest;
  if (!contest || contest.ruling || contest.withdrawnAt) throw new HttpError(409, "There's no contest waiting for a ruling here.", "conflict");
  const attempt = enrollment.attempts.find((a) => a.number === contest.attempt);
  if (!attempt || enrollment.attempts.length !== contest.attempt || enrollment.status !== "active") throw new HttpError(409, "The learner has moved on since they contested, so there's nothing to rule on.", "conflict");

  const after = decision.upheld ? withLineMet(enrollment, attempt, contest.itemId) : attempt;
  // The person's decision is the ruling. The second reader's recommendation is only recorded beside it.
  const recommended = contest.secondReader?.recommendation;
  const ruling: ContestRuling = { upheld: decision.upheld, note: decision.note.trim(), by: decision.by, at: new Date().toISOString(), scoreBefore: attempt.score, scoreAfter: after.score, ...(recommended ? { readerRecommended: recommended } : {}) };
  getAuditLog().append({
    action: "contest.ruled",
    actor: decision.by,
    reason: `${decision.upheld ? "Upheld" : "Not upheld"}: "${learnerLineText(contest.itemId)}" on attempt ${attempt.number} of ${id}, ${ruling.scoreBefore} to ${ruling.scoreAfter}.${recommended ? ` The second reader had recommended ${recommended === "uphold" ? "upholding" : "letting the grade stand"}.` : ""} ${ruling.note}`,
  });
  return saveEnrollment({
    ...enrollment,
    attempts: [...enrollment.attempts.slice(0, -1), after],
    status: after.outcome === "pass" ? "passed" : enrollment.status,
    // A line that now counts as met is off the study list.
    studyTicks: (enrollment.studyTicks ?? []).filter((item) => item !== contest.itemId),
    contest: { ...contest, ruling },
  });
}
