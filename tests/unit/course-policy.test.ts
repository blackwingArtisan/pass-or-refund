import { describe, expect, it } from "vitest";
import { rubric } from "@/lib/course/content";
import { checkGuarantee, completedFails, countsTowardRefund, formatCents, guaranteeVoid, learnerKey, refundAmountProblem, sameLearner } from "@/lib/course/policy";

const answered = Object.fromEntries(rubric.questions.map((q) => [q.id, "An answer."]));
const fail = { number: 1, outcome: "fail", score: 40, answers: answered, flagged: false, reviewedStudyList: true };
const second = { ...fail, number: 2 };
const refundDue = (attempts: (typeof fail)[], priorRefund = false) => checkGuarantee(attempts, priorRefund).due;

describe("refund policy", () => {
  it("needs two completed failing attempts", () => {
    expect(refundDue([fail])).toBe(false);
    expect(refundDue([fail, second])).toBe(true);
  });

  it("doesn't count a blank question or a score under 25", () => {
    expect(countsTowardRefund({ ...fail, answers: { ...answered, q3: "  " } })).toBe(false);
    expect(countsTowardRefund({ ...fail, score: 24 })).toBe(false);
    expect(countsTowardRefund({ ...fail, score: 25 })).toBe(true);
    expect(completedFails([fail, { ...fail, score: 10 }])).toBe(1);
  });

  it("doesn't count an attempt that didn't fail", () => {
    expect(countsTowardRefund({ ...fail, outcome: "pass" })).toBe(false);
    expect(countsTowardRefund({ ...fail, outcome: "review" })).toBe(false);
  });

  it("voids the guarantee on a flagged attempt, even with two completed fails", () => {
    const flagged = { ...fail, flagged: true };
    expect(guaranteeVoid([fail, flagged])).toBe(true);
    expect(refundDue([fail, second, { ...flagged, number: 3 }])).toBe(false);
    expect(checkGuarantee([fail, { ...second, flagged: true }], false).checks.find((c) => c.rule === "no_injection")?.passed).toBe(false);
  });

  it("allows one refund per learner per course", () => {
    expect(refundDue([fail, second], true)).toBe(false);
    expect(checkGuarantee([fail, second], true).checks.find((c) => c.rule === "one_refund_per_learner")?.passed).toBe(false);
    expect(learnerKey(" Alex+courses@Example.com", "knives")).toBe(learnerKey("alex@example.com ", "knives"));
    expect(learnerKey("alex@example.com", "knives")).not.toBe(learnerKey("alex@example.com", "bread"));
  });

  it("matches the PayPal payer as well as the email, so a new email on the same payer is the same learner", () => {
    const buyer = (learnerEmail: string, payment?: { payerId?: string; payerEmail?: string }) => ({ learnerEmail, courseSlug: "knives", payment });
    expect(sameLearner(buyer("a@example.com"), buyer("A+x@Example.com"))).toBe(true);
    expect(sameLearner(buyer("a@example.com", { payerId: "P1" }), buyer("b@example.com", { payerId: "P1" }))).toBe(true);
    // Guest card in PayPal's window: no account id, but PayPal has the buyer's email.
    expect(sameLearner(buyer("a@example.com", { payerEmail: "Pat@Example.com" }), buyer("b@example.com", { payerEmail: "pat@example.com" }))).toBe(true);
    expect(sameLearner(buyer("a@example.com", { payerId: "P1", payerEmail: "x@example.com" }), buyer("b@example.com", { payerId: "P2", payerEmail: "y@example.com" }))).toBe(false);
    expect(sameLearner(buyer("a@example.com", {}), buyer("b@example.com", {}))).toBe(false);
    expect(sameLearner(buyer("a@example.com", { payerId: "P1" }), { ...buyer("b@example.com", { payerId: "P1" }), courseSlug: "bread" })).toBe(false);
  });

  it("counts a later attempt only after the study list was reviewed", () => {
    expect(countsTowardRefund({ ...second, reviewedStudyList: false })).toBe(false);
    expect(countsTowardRefund({ ...fail, reviewedStudyList: false })).toBe(true);
    expect(refundDue([fail, { ...second, reviewedStudyList: false }])).toBe(false);
  });

  it("names every rule, so the agent can give reasons", () => {
    expect(checkGuarantee([fail, second], false).checks.map((c) => [c.rule, c.passed])).toEqual([
      ["two_completed_fails", true],
      ["no_injection", true],
      ["one_refund_per_learner", true],
    ]);
  });

  it("pays back exactly what was paid", () => {
    expect(refundAmountProblem(4_900, 4_900)).toBeNull();
    expect(refundAmountProblem(4_901, 4_900)).toMatch(/asked for \$49.01.*paid \$49.00/);
    expect(refundAmountProblem(500_000, 4_900)).toMatch(/asked for \$5,000.00/);
    expect(refundAmountProblem(4_899, 4_900)).toMatch(/full \$49.00/);
    expect(refundAmountProblem(-100, 4_900)).toMatch(/full \$49.00/);
  });

  it("formats whole cents", () => {
    expect(formatCents(4_900)).toBe("$49.00");
    expect(formatCents(123_405)).toBe("$1,234.05");
  });
});
