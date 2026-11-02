/** The guarantee, in plain code. Safe to import in the browser. */
import { rubric } from "./content";
import type { GuaranteeDecision, RuleCheck } from "./types";

export const FAILS_FOR_REFUND = 2;
export const MIN_POINTS_FOR_REFUND = 25;
export const MAX_ANSWER_CHARS = 2_000;

/** Shown before purchase and on the fail screen. */
export const GUARANTEE_TERMS = [
  "Fail the final check twice and you get every cent back, automatically.",
  `Each of the two attempts has to be complete: every question answered and at least ${MIN_POINTS_FOR_REFUND} points.`,
  "Mark your study list as reviewed before you try again, or that attempt won't count.",
  "One refund per learner per course.",
  "Trying to trick the grader voids the guarantee.",
  "A person on the course team approves every refund before any money moves.",
];

interface AttemptFacts {
  number: number;
  outcome: string;
  score: number;
  answers: Record<string, string>;
  flagged: boolean;
  reviewedStudyList: boolean;
}

export function everyQuestionAnswered(answers: Record<string, string>): boolean {
  return rubric.questions.every((q) => (answers[q.id] ?? "").trim() !== "");
}

/** Every question answered and enough points to show a real try. */
export const attemptComplete = (attempt: Pick<AttemptFacts, "score" | "answers">) => everyQuestionAnswered(attempt.answers) && attempt.score >= MIN_POINTS_FOR_REFUND;

/** A failed attempt counts toward a refund only if the learner really tried, and studied after the last one. */
export function countsTowardRefund(attempt: AttemptFacts): boolean {
  return attempt.outcome === "fail" && attemptComplete(attempt) && (attempt.number === 1 || attempt.reviewedStudyList);
}

export const completedFails = (attempts: AttemptFacts[]) => attempts.filter(countsTowardRefund).length;
export const guaranteeVoid = (attempts: AttemptFacts[]) => attempts.some((a) => a.flagged);

/** Case and +tags don't make a new learner. */
export function learnerKey(email: string, courseSlug: string): string {
  return `${email.trim().toLowerCase().replace(/\+[^@]*@/, "@")}|${courseSlug}`;
}

/** The whole rule. `priorRefund` is another purchase by this learner, paid back or on its way. */
export function checkGuarantee(attempts: AttemptFacts[], priorRefund: boolean): GuaranteeDecision {
  const fails = completedFails(attempts);
  const checks: RuleCheck[] = [
    { rule: "two_completed_fails", passed: fails >= FAILS_FOR_REFUND, detail: `${fails} of ${FAILS_FOR_REFUND} completed failing attempts. An attempt counts when every question is answered, it scored at least ${MIN_POINTS_FOR_REFUND}, and the study list from the attempt before was reviewed.` },
    { rule: "no_injection", passed: !guaranteeVoid(attempts), detail: guaranteeVoid(attempts) ? "An attempt tried to instruct the grader, which voids the guarantee." : "No attempt tried to instruct the grader." },
    { rule: "one_refund_per_learner", passed: !priorRefund, detail: priorRefund ? "This learner has already had a refund for this course." : "This is the learner's first refund for this course." },
  ];
  return { due: checks.every((c) => c.passed), checks };
}

export function formatCents(cents: number): string {
  return `$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
}

/** The guarantee pays back exactly what was paid: not a cent more, whatever an agent asks, and not a cent less. */
export function refundAmountProblem(requestedCents: number, paidCents: number): string | null {
  if (requestedCents > paidCents) return `The agent asked for ${formatCents(requestedCents)}, but the learner paid ${formatCents(paidCents)}.`;
  if (requestedCents < paidCents) return `The agent asked for ${formatCents(Math.max(requestedCents, 0))}, but the guarantee pays back the full ${formatCents(paidCents)}.`;
  return null;
}
