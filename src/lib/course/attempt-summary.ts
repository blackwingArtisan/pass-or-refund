import type { Attempt, EnrollmentStatus } from "./types";

export interface AttemptSummary {
  /** "Attempt 1: 34/100, pass mark 70. Not passed." */
  headline: string;
  /** "3 met · 4 partial · 7 missed" */
  tally: string;
  /** "Biggest loss: Question 3 (9/25)", only when points were lost. */
  biggestLoss?: string;
  /** What happens next, in one short sentence. */
  next: string;
}

const OUTCOME_WORD = { pass: "Passed", fail: "Not passed", review: "Under review" } as const;

export const whenLabel = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" });

/** What the learner does or waits for after their latest attempt, from the enrollment's status alone. */
export function nextStep(input: { status: EnrollmentStatus; attemptNumber: number; nextAttemptAt?: string; formatWhen?: (iso: string) => string }): string {
  const { status, attemptNumber, nextAttemptAt, formatWhen = whenLabel } = input;
  const nextTry = attemptNumber + 1;
  switch (status) {
    case "active":
      return nextAttemptAt ? `Next: attempt ${nextTry} opens ${formatWhen(nextAttemptAt)}.` : `Next: attempt ${nextTry} is open below.`;
    case "passed":
      return "Next: nothing. Your certificate is above.";
    case "under_review":
      return "Next: a person checks it within one business day.";
    case "refund_pending":
      return "Next: a person on the course team approves your refund.";
    case "refund_review":
      return "Next: a person looks at your case, then the refund.";
    case "refunded":
      return "Next: nothing. PayPal has your refund.";
    case "refund_declined":
      return "Next: the course team declined, with their reason above.";
    case "refund_blocked":
      return "Next: the course team reviews the refund again.";
    case "unpaid":
      return "Next: finish the purchase.";
  }
}

/**
 * The one line that opens "Your results": which attempt, its score against the pass mark, how the
 * rubric lines came out, where the most points went, and what happens next.
 */
export function attemptSummary(input: {
  attempt: Pick<Attempt, "number" | "score" | "outcome" | "runs" | "shownRun">;
  passMark: number;
  questions: { id: string; points: number }[];
  status: EnrollmentStatus;
  nextAttemptAt?: string;
  formatWhen?: (iso: string) => string;
}): AttemptSummary {
  const { attempt, passMark, questions } = input;
  const run = attempt.runs[attempt.shownRun];
  const count = (v: string) => run.items.filter((i) => i.verdict === v).length;
  const tally = `${count("met")} met · ${count("partial")} partial · ${count("not_met")} missed`;
  let worst: { index: number; got: number; of: number } | undefined;
  questions.forEach((q, index) => {
    const got = run.perQuestion[q.id];
    if (got === undefined) return;
    const lost = q.points - got;
    if (lost > 0 && (!worst || lost > worst.of - worst.got)) worst = { index, got, of: q.points };
  });
  return {
    headline: `Attempt ${attempt.number}: ${attempt.score}/100, pass mark ${passMark}. ${OUTCOME_WORD[attempt.outcome]}.`,
    tally,
    biggestLoss: worst && attempt.outcome !== "pass" ? `Biggest loss: Question ${worst.index + 1} (${worst.got}/${worst.of})` : undefined,
    next: nextStep({ status: input.status, attemptNumber: attempt.number, nextAttemptAt: input.nextAttemptAt, formatWhen: input.formatWhen }),
  };
}
