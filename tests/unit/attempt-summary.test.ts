import { describe, expect, it } from "vitest";
import { attemptSummary, nextStep } from "@/lib/course/attempt-summary";

const questions = [
  { id: "q1", points: 25 },
  { id: "q2", points: 25 },
  { id: "q3", points: 25 },
  { id: "q4", points: 25 },
];
const item = (id: string, verdict: "met" | "partial" | "not_met") => ({ id, verdict, points: 0, quote: "" });
const run = {
  perQuestion: { q1: 12, q2: 8, q3: 9, q4: 5 },
  items: [item("a", "met"), item("b", "met"), item("c", "met"), item("d", "partial"), item("e", "partial"), item("f", "partial"), item("g", "partial"), ...["h", "i", "j", "k", "l", "m", "n"].map((id) => item(id, "not_met"))],
};
const attempt = (score: number, outcome: "pass" | "fail" | "review") => ({ number: 1, score, outcome, shownRun: 0, runs: [run] }) as never;
const at = () => "Tuesday 3:00 PM";

describe("the attempt summary that opens Your results", () => {
  it("names the attempt, its score against the pass mark, the tally, the biggest loss and what's next", () => {
    expect(attemptSummary({ attempt: attempt(34, "fail"), passMark: 70, questions, status: "active", nextAttemptAt: "2026-11-10T21:00:00Z", formatWhen: at })).toEqual({
      headline: "Attempt 1: 34/100, pass mark 70. Not passed.",
      tally: "3 met · 4 partial · 7 missed",
      biggestLoss: "Biggest loss: Question 4 (5/25)",
      next: "Next: attempt 2 opens Tuesday 3:00 PM.",
    });
  });

  it("leaves out the biggest loss on a pass, and says the next attempt is open when there's no wait", () => {
    const passed = attemptSummary({ attempt: attempt(82, "pass"), passMark: 70, questions, status: "passed" });
    expect(passed.headline).toBe("Attempt 1: 82/100, pass mark 70. Passed.");
    expect(passed.biggestLoss).toBeUndefined();
    expect(passed.next).toBe("Next: nothing. Your certificate is above.");
    expect(nextStep({ status: "active", attemptNumber: 1 })).toBe("Next: attempt 2 is open below.");
  });

  it("skips a question this attempt wasn't asked", () => {
    const fewer = attemptSummary({ attempt: attempt(34, "fail"), passMark: 70, questions: [...questions, { id: "q5", points: 40 }], status: "refund_pending" });
    expect(fewer.biggestLoss).toBe("Biggest loss: Question 4 (5/25)");
    expect(fewer.next).toBe("Next: a person on the course team approves your refund.");
  });

  it("has one short next step for every status, each under 70 characters", () => {
    for (const status of ["unpaid", "active", "passed", "under_review", "refund_pending", "refund_review", "refund_declined", "refund_blocked", "refunded"] as const) {
      const line = nextStep({ status, attemptNumber: 2, nextAttemptAt: "2026-11-10T21:00:00Z", formatWhen: at });
      expect(line).toMatch(/^Next: /);
      expect(line.length).toBeLessThan(70);
    }
  });
});
