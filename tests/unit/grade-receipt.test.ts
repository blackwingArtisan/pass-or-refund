import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { stableStringify } from "@/lib/agent/idempotency";
import { enrollmentIfAny, saveEnrollment } from "@/lib/course/enrollments";
import { answersHash, checkGradeReceipt, gradeReceipt, receiptHashOf, type GradeReceipt, type ReceiptFacts } from "@/lib/course/grade-receipt";
import { rubricFingerprint } from "@/lib/course/rubric-lock";
import { rubric } from "@/lib/course/content";
import { ensureSamplePass } from "@/lib/course/sample-pass";
import type { Enrollment } from "@/lib/course/types";

/** The receipt as it leaves the server and comes back from a learner's download. */
const downloaded = (enrollment: Enrollment): GradeReceipt => JSON.parse(JSON.stringify(gradeReceipt(enrollment), null, 2));
const withoutHashAndDate = (receipt: GradeReceipt) => Object.fromEntries(Object.entries(receipt).filter(([k]) => k !== "receiptHash" && k !== "issuedAt")) as unknown as ReceiptFacts;

function refunded(): Enrollment {
  const base = ensureSamplePass();
  return saveEnrollment({
    ...structuredClone(base),
    id: `receipt_${Math.random().toString(36).slice(2, 10)}`,
    status: "refunded",
    attempts: [{ ...structuredClone(base.attempts[0]), outcome: "fail", score: 41 }, { ...structuredClone(base.attempts[0]), number: 2, outcome: "fail", score: 38 }],
    refund: { status: "refunded", runId: "run_receipt", requestedAt: new Date().toISOString(), refundId: "7RF12345AB678901C", refundStatus: "COMPLETED", refundedCents: 4900 } as Enrollment["refund"],
  });
}

describe("a learner's grade receipt", () => {
  it("carries the locked rubric fingerprint, every line's verdict, attempt hashes and a hash over all of it", () => {
    const enrollment = ensureSamplePass();
    const receipt = gradeReceipt(enrollment);
    expect(receipt.rubric).toEqual({ version: "1", fingerprint: rubricFingerprint(rubric), passMark: rubric.passMark });
    const items = rubric.questions.flatMap((q) => q.items);
    expect(receipt.attempts[0].items.map((i) => i.id)).toEqual(items.map((i) => i.id));
    expect(receipt.attempts[0].items.every((i) => ["met", "partial", "not_met"].includes(i.verdict) && i.points <= i.of)).toBe(true);
    expect(receipt.attempts[0].answersHash).toBe(createHash("sha256").update(stableStringify(enrollment.attempts[0].answers)).digest("hex"));
    expect(receipt.attempts[0].answersHash).toBe(answersHash(enrollment.attempts[0].answers));
    expect(receipt.receiptHash).toBe(receiptHashOf(withoutHashAndDate(receipt)));
    expect(receipt.refund).toBeNull();
    expect(JSON.stringify(receipt)).not.toMatch(/@/);
  });

  it("matches when checked as downloaded, even issued at another time", () => {
    const enrollment = ensureSamplePass();
    expect(checkGradeReceipt(downloaded(enrollment))).toEqual({ status: "matches", problems: [], enrollmentId: enrollment.id, receiptHash: gradeReceipt(enrollment).receiptHash });
    expect(gradeReceipt(enrollment, new Date(0)).receiptHash).toBe(gradeReceipt(enrollment).receiptHash);
  });

  it("says changed when a verdict is edited, and still changed when the editor rehashes it", () => {
    const edited = downloaded(ensureSamplePass());
    const line = edited.attempts[0].items.find((i) => i.verdict !== "met")!;
    Object.assign(line, { verdict: "met", points: line.of });
    edited.attempts[0].score = 100;
    const check = checkGradeReceipt(edited);
    expect(check.status).toBe("changed");
    expect(check.problems).toEqual(["The receipt's own hash no longer fits its contents, so something in it was edited.", "Attempt 1 differs from the graded record."]);

    edited.receiptHash = receiptHashOf(withoutHashAndDate(edited));
    expect(checkGradeReceipt(edited)).toMatchObject({ status: "changed", problems: ["Attempt 1 differs from the graded record."] });
  });

  it("names the PayPal refund id, and says changed when it's swapped", () => {
    const enrollment = refunded();
    const receipt = downloaded(enrollment);
    expect(receipt.refund).toEqual({ refundId: "7RF12345AB678901C", status: "COMPLETED", amountCents: 4900 });
    expect(receipt.attempts.map((a) => [a.number, a.outcome, a.score])).toEqual([[1, "fail", 41], [2, "fail", 38]]);
    expect(checkGradeReceipt(receipt).status).toBe("matches");

    receipt.refund!.refundId = "0000000000000000X";
    receipt.receiptHash = receiptHashOf(withoutHashAndDate(receipt));
    expect(checkGradeReceipt(receipt)).toMatchObject({ status: "changed", problems: ["The refund id differs from the one PayPal gave."] });
  });

  it("still matches after a later attempt, but not after the graded record itself changes", () => {
    const enrollment = refunded();
    const early = downloaded({ ...enrollment, attempts: enrollment.attempts.slice(0, 1), refund: undefined });
    expect(checkGradeReceipt(early).status).toBe("matches");

    const stored = enrollmentIfAny(enrollment.id)!;
    saveEnrollment({ ...stored, attempts: [{ ...stored.attempts[0], score: 70, outcome: "pass" }, stored.attempts[1]] });
    expect(checkGradeReceipt(early)).toMatchObject({ status: "changed", problems: ["Attempt 1 differs from the graded record."] });
  });

  it("says changed for anything that isn't a receipt, or a receipt for no enrollment on file", () => {
    expect(checkGradeReceipt(null)).toMatchObject({ status: "changed", problems: ["This isn't a Pass or Refund grade receipt."] });
    expect(checkGradeReceipt({ kind: "something else" }).status).toBe("changed");
    const stranger = downloaded(ensureSamplePass());
    stranger.enrollmentId = "en_nobody";
    stranger.receiptHash = receiptHashOf(withoutHashAndDate(stranger));
    expect(checkGradeReceipt(stranger)).toMatchObject({ status: "changed", problems: ["No enrollment with this receipt's id is on file."] });
  });
});
