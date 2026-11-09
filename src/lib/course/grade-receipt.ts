/**
 * A learner's grade receipt: what was bought, how each attempt was graded and any refund, with
 * hashes so it can be checked later. The answers themselves stay out of it; their hash is in.
 * Anyone holding the receipt can check it on the public rubric page: it "matches" only if its own
 * hash still fits its contents and every claim in it is still what's on file. Server only.
 */
import { createHash } from "node:crypto";
import { stableStringify } from "@/lib/agent/idempotency";
import type { Verdict } from "@/lib/grading/frozen/score-items";
import { courseTitleOf, rubricShownFor } from "./creator-store";
import { enrollmentIfAny } from "./enrollments";
import { rubricFingerprint } from "./rubric-lock";
import type { Attempt, Enrollment } from "./types";

export const RECEIPT_KIND = "pass-or-refund grade receipt";

export interface ReceiptItem {
  id: string;
  verdict: Verdict;
  /** Points earned for this line. */
  points: number;
  /** Points the line is worth. */
  of: number;
}

export interface ReceiptAttempt {
  number: number;
  submittedAt: string;
  outcome: Attempt["outcome"];
  score: number;
  items: ReceiptItem[];
  /** SHA-256 of the answers as sent, so the learner can show which answers were graded. */
  answersHash: string;
  /** SHA-256 of everything above plus the answers. */
  attemptHash: string;
}

export interface ReceiptFacts {
  kind: typeof RECEIPT_KIND;
  enrollmentId: string;
  course: { title: string; id?: string };
  learnerName: string;
  rubric: { version: string; fingerprint: string; passMark: number };
  attempts: ReceiptAttempt[];
  refund: { refundId: string; status?: string; amountCents?: number } | null;
}

export interface GradeReceipt extends ReceiptFacts {
  issuedAt: string;
  /** SHA-256 of every field except issuedAt and this one. */
  receiptHash: string;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export const answersHash = (answers: Record<string, string>) => sha256(stableStringify(answers));

function receiptAttempt(attempt: Attempt, worth: Map<string, number>): ReceiptAttempt {
  const items = (attempt.runs[attempt.shownRun]?.items ?? []).map((item) => ({ id: item.id, verdict: item.verdict, points: item.points, of: worth.get(item.id) ?? 0 }));
  const graded = { number: attempt.number, submittedAt: attempt.submittedAt, outcome: attempt.outcome, score: attempt.score, items };
  return { ...graded, answersHash: answersHash(attempt.answers), attemptHash: sha256(stableStringify({ ...graded, answers: attempt.answers })) };
}

export const receiptHashOf = (facts: ReceiptFacts) => sha256(stableStringify(facts));

export function receiptFacts(enrollment: Enrollment): ReceiptFacts {
  const rubric = rubricShownFor(enrollment);
  const worth = new Map(rubric.questions.flatMap((q) => q.items.map((item) => [item.id, item.points] as const)));
  const refund = enrollment.refund?.refundId ? { refundId: enrollment.refund.refundId, status: enrollment.refund.refundStatus, amountCents: enrollment.refund.refundedCents } : null;
  return {
    kind: RECEIPT_KIND,
    enrollmentId: enrollment.id,
    course: { title: courseTitleOf(enrollment), ...(enrollment.courseId ? { id: enrollment.courseId } : {}) },
    learnerName: enrollment.learnerName,
    rubric: { version: enrollment.rubric?.version ?? "1", fingerprint: enrollment.rubric?.fingerprint ?? rubricFingerprint(rubric), passMark: rubric.passMark },
    attempts: enrollment.attempts.map((a) => receiptAttempt(a, worth)),
    refund,
  };
}

export function gradeReceipt(enrollment: Enrollment, now = new Date()): GradeReceipt {
  const facts = receiptFacts(enrollment);
  return { ...facts, issuedAt: now.toISOString(), receiptHash: receiptHashOf(facts) };
}

export interface ReceiptCheck {
  status: "matches" | "changed";
  /** Plain lines saying what differs. Empty when it matches. */
  problems: string[];
  enrollmentId?: string;
  receiptHash?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Checks a receipt as a stranger would hand it over. Later attempts or a later refund on file don't
 * make an older receipt wrong; a claim in the receipt that differs from the record does.
 */
export function checkGradeReceipt(input: unknown, find: (id: string) => Enrollment | undefined = enrollmentIfAny): ReceiptCheck {
  if (!isObject(input) || input.kind !== RECEIPT_KIND || typeof input.enrollmentId !== "string" || typeof input.receiptHash !== "string") {
    return { status: "changed", problems: ["This isn't a Pass or Refund grade receipt."] };
  }
  const { receiptHash, ...rest } = input;
  const claimed = Object.fromEntries(Object.entries(rest).filter(([k]) => k !== "issuedAt"));
  const base = { enrollmentId: input.enrollmentId, receiptHash };
  const problems: string[] = [];
  if (receiptHashOf(claimed as unknown as ReceiptFacts) !== receiptHash) problems.push("The receipt's own hash no longer fits its contents, so something in it was edited.");
  const enrollment = find(input.enrollmentId);
  if (!enrollment) return { ...base, status: "changed", problems: [...problems, "No enrollment with this receipt's id is on file."] };

  const onFile = receiptFacts(enrollment);
  const said = claimed as unknown as Partial<ReceiptFacts>;
  if (stableStringify(said.course) !== stableStringify(onFile.course)) problems.push("The course differs from the one on file.");
  if (said.learnerName !== onFile.learnerName) problems.push("The learner's name differs from the one on file.");
  if (stableStringify(said.rubric) !== stableStringify(onFile.rubric)) problems.push("The rubric fingerprint differs from the one locked at purchase.");
  const attempts = Array.isArray(said.attempts) ? said.attempts : [];
  if (attempts.length === 0 && onFile.attempts.length > 0) problems.push("The receipt lists no attempts.");
  for (const attempt of attempts) {
    const kept = onFile.attempts.find((a) => a.number === attempt?.number);
    if (!kept) problems.push(`Attempt ${attempt?.number} isn't on file.`);
    else if (stableStringify(attempt) !== stableStringify(kept)) problems.push(`Attempt ${kept.number} differs from the graded record.`);
  }
  if (said.refund && said.refund.refundId !== onFile.refund?.refundId) problems.push("The refund id differs from the one PayPal gave.");
  return { ...base, status: problems.length ? "changed" : "matches", problems };
}
