/** The guarantee, in plain code. Safe to import in the browser. */
import { rubric } from "./content";

export const FAILS_FOR_REFUND = 2;
export const MIN_POINTS_FOR_REFUND = 25;
export const MAX_ANSWER_CHARS = 2_000;

/** Shown before purchase and on the fail screen. */
export const GUARANTEE_TERMS = [
  "Fail the final check twice and you get every cent back, automatically.",
  `Each of the two attempts has to be complete: every question answered and at least ${MIN_POINTS_FOR_REFUND} points.`,
  "Trying to trick the grader voids the guarantee.",
  "A person on the course team approves every refund before any money moves.",
];

interface AttemptFacts {
  outcome: string;
  score: number;
  answers: Record<string, string>;
  flagged: boolean;
}

export function everyQuestionAnswered(answers: Record<string, string>): boolean {
  return rubric.questions.every((q) => (answers[q.id] ?? "").trim() !== "");
}

/** A failed attempt counts toward a refund only if the learner really tried. */
export function countsTowardRefund(attempt: AttemptFacts): boolean {
  return attempt.outcome === "fail" && everyQuestionAnswered(attempt.answers) && attempt.score >= MIN_POINTS_FOR_REFUND;
}

export const completedFails = (attempts: AttemptFacts[]) => attempts.filter(countsTowardRefund).length;
export const guaranteeVoid = (attempts: AttemptFacts[]) => attempts.some((a) => a.flagged);
export const refundDue = (attempts: AttemptFacts[]) => !guaranteeVoid(attempts) && completedFails(attempts) >= FAILS_FOR_REFUND;

export function formatCents(cents: number): string {
  return `$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
}
