import { describe, expect, it } from "vitest";
import { decidingItemId, waitsForTeam } from "@/lib/course/screen-order";
import type { EnrollmentView } from "@/lib/course/types";
import type { ScoredItem } from "@/lib/grading/frozen/score-items";

const item = (id: string, points: number, quote = ""): ScoredItem => ({ id, points, quote, verdict: points === 0 ? "not_met" : "met", quoteFound: Boolean(quote) }) as ScoredItem;

describe("the graded result shows one deciding quote per question", () => {
  const max = { a: 5, b: 10, c: 5 };
  it("picks the quoted line that lost the most points", () => {
    expect(decidingItemId([item("a", 5, "kept"), item("b", 2, "lost eight"), item("c", 0, "lost five")], max)).toBe("b");
  });
  it("falls back to the first quote when nothing with a quote lost points", () => {
    expect(decidingItemId([item("a", 5, "first"), item("b", 0), item("c", 5, "third")], max)).toBe("a");
  });
  it("has nothing to show when the grader quoted nothing", () => {
    expect(decidingItemId([item("a", 0), item("b", 0)], max)).toBeUndefined();
  });
});

describe("/team opens on what needs a person", () => {
  const base = { status: "active", attempts: [] } as unknown as EnrollmentView;
  it("lists a pending approval, a review, a 69-70 and a blocked refund first", () => {
    for (const status of ["refund_pending", "refund_review", "under_review", "refund_blocked"] as const) expect(waitsForTeam({ ...base, status })).toBe(true);
    expect(waitsForTeam({ ...base, approval: { id: "ap_1" } } as unknown as EnrollmentView)).toBe(true);
  });
  it("lists an open contest or dispute, but not a ruled one or a closed one", () => {
    const contest = { attempt: 1, itemId: "q1a", note: "n", at: "t" };
    expect(waitsForTeam({ ...base, contest })).toBe(true);
    expect(waitsForTeam({ ...base, contest: { ...contest, ruling: { upheld: true, note: "ok" } as never } })).toBe(false);
    expect(waitsForTeam({ ...base, contest: { ...contest, withdrawnAt: "t" } })).toBe(false);
    const dispute = { id: "PP-D-1", reason: "x", status: "OPEN", amountCents: 4900, openedAt: "t", updatedAt: "t" };
    expect(waitsForTeam({ ...base, dispute })).toBe(true);
    expect(waitsForTeam({ ...base, dispute: { ...dispute, status: "RESOLVED" } })).toBe(false);
  });
  it("leaves studying, passed, refunded and declined learners below", () => {
    for (const status of ["active", "passed", "refunded", "refund_declined"] as const) expect(waitsForTeam({ ...base, status })).toBe(false);
  });
});
