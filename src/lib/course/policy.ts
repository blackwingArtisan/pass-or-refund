/** The guarantee, in plain code. Safe to import in the browser. */
import { rubric } from "./content";
import type { GuaranteeDecision, RuleCheck } from "./types";

export const FAILS_FOR_REFUND = 2;
export const MIN_POINTS_FOR_REFUND = 25;
export const MAX_ANSWER_CHARS = 2_000;
/** A failed attempt opens the next one this much later, so the study list has time to work. */
export const ATTEMPT_GAP_HOURS = 24;
/** Two attempts sharing this much of their wording are the same attempt. Keeps honest rewrites apart. */
export const NEAR_COPY_SIMILARITY = 0.9;

/** The guarantee in four lines, shown before purchase and on the fail screen; GUARANTEE_TERMS is the full text on /terms. */
export const GUARANTEE_SUMMARY = [
  `Fail the final check twice, with two complete attempts ${ATTEMPT_GAP_HOURS} hours apart, and you get every cent back.`,
  "Review your study list before you try again, or that attempt won't count.",
  "A person on the course team approves every refund before any money moves. If the course team declines, they have to say why.",
  "One refund per PayPal account and email, and trying to trick the grader voids the guarantee.",
];

/** Shown before purchase and on the fail screen. */
export const GUARANTEE_TERMS = [
  "Fail the final check twice and you get every cent back.",
  `Each of the two attempts has to be complete: every question answered and at least ${MIN_POINTS_FOR_REFUND} points.`,
  "Mark your study list as reviewed before you try again, or that attempt won't count.",
  "An attempt that nearly copies an earlier one counts as incomplete.",
  `Attempts are ${ATTEMPT_GAP_HOURS} hours apart, so you have time to study.`,
  "One refund per PayPal account and per email for each course, and a refund ends your access to the lessons.",
  "Trying to trick the grader voids the guarantee.",
  "A person on the course team approves every refund before any money moves.",
  "If the course team declines, they have to say why. You see their reason, it's listed on the public cohort page without your name, and you can still open a dispute with PayPal.",
  "If nobody on the course team decides within an hour, your refund is marked overdue, with the hours, on the public cohort page until someone does.",
];

interface AttemptFacts {
  number: number;
  outcome: string;
  score: number;
  answers: Record<string, string>;
  questionIds?: string[];
  flagged: boolean;
  reviewedStudyList: boolean;
  nearCopyOf?: number;
}

/** Every question asked has an answer. The questions are the sample course's unless given. */
export function everyQuestionAnswered(answers: Record<string, string>, questionIds: string[] = rubric.questions.map((q) => q.id)): boolean {
  return questionIds.every((id) => (answers[id] ?? "").trim() !== "");
}

interface WithItems<Item> {
  runs: { items: Item[] }[];
  shownRun: number;
}

const shownItems = <Item,>(attempt: WithItems<Item>) => attempt.runs[attempt.shownRun].items;

/** The rubric items the attempt missed. They're the study list. */
export const missedItems = <Item extends { verdict: string }>(attempt: WithItems<Item>) => shownItems(attempt).filter((item) => item.verdict === "not_met");

/** Items that lost points: what a person goes through before settling an attempt. */
export const shortfallItems = <Item extends { verdict: string }>(attempt: WithItems<Item>) => shownItems(attempt).filter((item) => item.verdict !== "met");

/** Every question answered, enough points to show a real try, and written afresh. */
export const attemptComplete = (attempt: Pick<AttemptFacts, "score" | "answers" | "nearCopyOf" | "questionIds">) => everyQuestionAnswered(attempt.answers, attempt.questionIds) && attempt.score >= MIN_POINTS_FOR_REFUND && attempt.nearCopyOf === undefined;

const wordsOf = (answers: Record<string, string>) => Object.values(answers).join(" ").toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** The share of wording two attempts have in common, from 0 to 1. Shuffling the words doesn't lower it. */
export function answerSimilarity(a: Record<string, string>, b: Record<string, string>): number {
  const first = wordsOf(a);
  const second = wordsOf(b);
  if (first.length === 0 || second.length === 0) return 0;
  const left = new Map<string, number>();
  for (const word of first) left.set(word, (left.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of second) {
    const count = left.get(word) ?? 0;
    if (count > 0) {
      shared += 1;
      left.set(word, count - 1);
    }
  }
  return (2 * shared) / (first.length + second.length);
}

/** The number of the earlier attempt these answers nearly copy, if any. */
export function nearCopyOf(answers: Record<string, string>, earlier: { number: number; answers: Record<string, string> }[]): number | undefined {
  return earlier.find((attempt) => answerSimilarity(answers, attempt.answers) >= NEAR_COPY_SIMILARITY)?.number;
}

/** When the next attempt opens after a fail, unless the learner skipped the wait. */
export function nextAttemptOpensAt(attempts: { number: number; outcome: string; submittedAt: string }[], gapSkippedAfter: number | undefined, now = Date.now()): string | null {
  const latest = attempts.at(-1);
  if (latest?.outcome !== "fail" || latest.number === gapSkippedAfter) return null;
  const opens = Date.parse(latest.submittedAt) + ATTEMPT_GAP_HOURS * 3_600_000;
  return opens > now ? new Date(opens).toISOString() : null;
}

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

interface LearnerFacts {
  learnerEmail: string;
  courseSlug: string;
  payment?: { payerId?: string; payerEmail?: string };
}

const sameValue = (a?: string, b?: string) => Boolean(a) && a === b;
const emailKey = (email?: string) => (email ? learnerKey(email, "") : undefined);

/**
 * The same person on the same course: the same email typed at checkout, or the same PayPal payer
 * under a new email. The payer is PayPal's account id or the email PayPal has for the buyer (a guest
 * card checkout in PayPal's window has an email but may have no account id).
 */
export function sameLearner(a: LearnerFacts, b: LearnerFacts): boolean {
  if (a.courseSlug !== b.courseSlug) return false;
  if (learnerKey(a.learnerEmail, a.courseSlug) === learnerKey(b.learnerEmail, b.courseSlug)) return true;
  return sameValue(a.payment?.payerId, b.payment?.payerId) || sameValue(emailKey(a.payment?.payerEmail), emailKey(b.payment?.payerEmail));
}

/** The whole rule. `priorRefund` is another purchase by this learner, paid back or on its way. */
export function checkGuarantee(attempts: AttemptFacts[], priorRefund: boolean): GuaranteeDecision {
  const fails = completedFails(attempts);
  const checks: RuleCheck[] = [
    { rule: "two_completed_fails", passed: fails >= FAILS_FOR_REFUND, detail: `${fails} of ${FAILS_FOR_REFUND} completed failing attempts. An attempt counts when every question is answered, it scored at least ${MIN_POINTS_FOR_REFUND}, it isn't a near-copy of an earlier attempt, and the study list from the attempt before was reviewed.` },
    { rule: "no_injection", passed: !guaranteeVoid(attempts), detail: guaranteeVoid(attempts) ? "An attempt tried to instruct the grader, which voids the guarantee." : "No attempt tried to instruct the grader." },
    { rule: "one_refund_per_learner", passed: !priorRefund, detail: priorRefund ? "This learner, by email or PayPal payer, has already had a refund for this course." : "This is the learner's first refund for this course." },
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
