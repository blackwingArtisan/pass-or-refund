import { describe, expect, it } from "vitest";
import { rubric } from "@/lib/course/content";
import { completedFails, countsTowardRefund, formatCents, guaranteeVoid, refundDue } from "@/lib/course/policy";

const answered = Object.fromEntries(rubric.questions.map((q) => [q.id, "An answer."]));
const fail = { outcome: "fail", score: 40, answers: answered, flagged: false };

describe("refund policy", () => {
  it("needs two completed failing attempts", () => {
    expect(refundDue([fail])).toBe(false);
    expect(refundDue([fail, fail])).toBe(true);
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
    expect(refundDue([fail, flagged, fail])).toBe(false);
  });

  it("formats whole cents", () => {
    expect(formatCents(4_900)).toBe("$49.00");
    expect(formatCents(123_405)).toBe("$1,234.05");
  });
});
