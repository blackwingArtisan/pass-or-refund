import { describe, expect, it } from "vitest";
import { buildCohort } from "@/lib/course/cohort";
import { course, rubric } from "@/lib/course/content";
import { sampleCohort, seedSampleCohort } from "@/lib/course/sample-cohort";
import type { Attempt, Enrollment, EnrollmentStatus } from "@/lib/course/types";
import type { Verdict } from "@/lib/grading/frozen/score-items";

const ITEM_POINTS = Object.fromEntries(rubric.questions.flatMap((q) => q.items.map((i) => [i.id, i.points])));

/** An attempt where every item is met except the ones named. */
function attempt(number: number, outcome: Attempt["outcome"], misses: Record<string, Verdict> = {}, flagged = false): Attempt {
  const items = Object.keys(ITEM_POINTS).map((id) => {
    const verdict = misses[id] ?? "met";
    return { id, verdict, points: verdict === "met" ? ITEM_POINTS[id] : verdict === "partial" ? Math.floor(ITEM_POINTS[id] / 2) : 0, quote: "", quoteFound: true };
  });
  const perQuestion = Object.fromEntries(rubric.questions.map((q) => [q.id, q.items.reduce((total, i) => total + items.find((x) => x.id === i.id)!.points, 0)]));
  const score = Object.values(perQuestion).reduce((a, b) => a + b, 0);
  const run = { total: score, totalQuoteChecked: score, perQuestion, items, caps: [], injectionAttempted: flagged, injectionQuote: "", mocked: true, costUsd: 0 };
  return { number, submittedAt: "2026-11-01T10:00:00.000Z", answers: {}, reviewedStudyList: false, outcome, score, runs: [run], shownRun: 0, flagged, injectionQuote: "", costUsd: 0 };
}

let next = 0;
function enrollment(status: EnrollmentStatus, attempts: Attempt[], extra: Partial<Enrollment> = {}): Enrollment {
  next += 1;
  return { id: `en_${next}`, learnerName: "Secret Name", learnerEmail: "secret@example.com", courseSlug: course.slug, status, createdAt: "2026-11-01T09:00:00.000Z", priceCents: 4900, attempts, ...extra };
}

const REFUND = { runId: "run", requestedAt: "2026-11-01T11:00:00.000Z" };

describe("cohort results", () => {
  it("leaves out people who never paid or haven't taken the check from the rates", () => {
    const cohort = buildCohort([enrollment("unpaid", []), enrollment("active", []), enrollment("passed", [attempt(1, "pass")])]);
    expect(cohort.paidLearners).toBe(2);
    expect(cohort.sources.learners).toHaveLength(1);
    expect(cohort.courses).toEqual([expect.objectContaining({ course: course.title, learners: 1, passed: 1, passRate: 1, attempts: 1 })]);
  });

  it("works out the pass rate by course and by question", () => {
    const allOfQ1Missed = { q1a: "not_met", q1b: "not_met", q1c: "not_met" } as const;
    const cohort = buildCohort([enrollment("passed", [attempt(1, "pass")]), enrollment("active", [attempt(1, "fail", allOfQ1Missed)])]);
    expect(cohort.courses[0].passRate).toBe(0.5);
    const q1 = cohort.questions.find((q) => q.question.startsWith("Q1"))!;
    expect(q1).toMatchObject({ answered: 2, cleared: 1, passRate: 0.5, averagePoints: 12.5, maxPoints: 25 });
    expect(cohort.questions.find((q) => q.question.startsWith("Q2"))!.passRate).toBe(1);
  });

  it("clears a question at 70% of its points, not below", () => {
    // Q2 is 25 points: losing 7 leaves 18 (72%), losing 7 + 6 leaves 12 (48%).
    const cohort = buildCohort([enrollment("passed", [attempt(1, "pass", { q2a: "not_met" })]), enrollment("active", [attempt(1, "fail", { q2a: "not_met", q2d: "not_met" })])]);
    expect(cohort.questions.find((q) => q.question.startsWith("Q2"))).toMatchObject({ answered: 2, cleared: 1 });
  });

  it("ranks the rubric items missed most, counting partial credit as a miss and a tie by points lost", () => {
    const cohort = buildCohort([
      enrollment("active", [attempt(1, "fail", { q2d: "not_met", q3a: "not_met" })]),
      enrollment("active", [attempt(1, "fail", { q2d: "partial", q3a: "partial" })]),
      enrollment("passed", [attempt(1, "pass", { q1a: "partial" })]),
    ]);
    expect(cohort.items.slice(0, 3).map((i) => i.itemId)).toEqual(["q3a", "q2d", "q1a"]);
    expect(cohort.items[1]).toMatchObject({ answered: 3, met: 1, partial: 1, notMet: 1, missRate: 2 / 3, pointsLost: 9 });
    expect(cohort.items[1].lesson).toBe("3. Holding the angle");
  });

  it("shows rubric text without the note to the grader", () => {
    const { items } = buildCohort([enrollment("passed", [attempt(1, "pass")])]);
    expect(items.find((i) => i.itemId === "q2a")!.item).toBe("Soaks the stone until the bubbles stop, about ten minutes");
  });

  it("reads the grade the learner was shown when a score needed three", () => {
    const graded = attempt(1, "pass");
    const shown = attempt(1, "pass", { q4a: "not_met" });
    const cohort = buildCohort([enrollment("passed", [{ ...graded, runs: [graded.runs[0], shown.runs[0], graded.runs[0]], shownRun: 1 }])]);
    expect(cohort.items[0]).toMatchObject({ itemId: "q4a", notMet: 1 });
  });

  it("keeps trick attempts out of what the course teaches, but counts them", () => {
    const cohort = buildCohort([enrollment("active", [attempt(1, "fail", { q1a: "not_met" }, true)])]);
    expect(cohort.flaggedAttempts).toBe(1);
    expect(cohort.sources.attempts).toHaveLength(1);
    expect(cohort.sources.items).toHaveLength(0);
    expect(cohort.items.every((i) => i.answered === 0)).toBe(true);
  });

  it("only counts money PayPal reported as paid", () => {
    const fails = [attempt(1, "fail"), attempt(2, "fail")];
    const cohort = buildCohort([
      enrollment("refunded", fails, { refund: { ...REFUND, refundStatus: "PENDING", refundedCents: 4900 } }),
      enrollment("refund_declined", fails, { refund: { ...REFUND, proposal: { amountValue: "49.00", reasons: ["Two fails."], proposedAt: REFUND.requestedAt }, declineNote: "Asked for a new attempt." } }),
      enrollment("refund_blocked", fails, { refund: { ...REFUND, error: "The agent asked for $500.00." } }),
    ]);
    expect(cohort.courses[0]).toMatchObject({ refunds: 1, refundedUsd: 49 });
    expect(cohort.sources.refunds.map((r) => [r.state, r.amountUsd, r.paypalStatus, r.reason])).toEqual([
      ["Refunded", 49, "PENDING", ""],
      ["Declined", 0, "No refund at PayPal", "Asked for a new attempt."],
      ["Blocked", 0, "No refund at PayPal", "The agent asked for $500.00."],
    ]);
  });

  it("never carries a learner's name or email", () => {
    const cohort = JSON.stringify(buildCohort([enrollment("passed", [attempt(1, "pass")])]));
    expect(cohort).not.toContain("Secret Name");
    expect(cohort).not.toContain("secret@example.com");
  });
});

describe("sample cohort", () => {
  it("gives the same weak spots every time, from the real rubric", () => {
    seedSampleCohort(Date.parse("2026-11-01T00:00:00.000Z"));
    const cohort = buildCohort(sampleCohort().list());
    expect(cohort.sources.learners).toHaveLength(36);
    expect(cohort.items.slice(0, 2).map((i) => i.itemId).sort()).toEqual(["q2d", "q3b"]);
    expect(cohort.courses[0].passRate).toBeGreaterThan(0.3);
    expect(cohort.courses[0].passRate).toBeLessThan(0.9);
    expect(cohort.courses[0].refunds).toBeGreaterThan(0);
    for (const row of cohort.sources.attempts) expect(row.score).toBeLessThanOrEqual(100);
  });
});
