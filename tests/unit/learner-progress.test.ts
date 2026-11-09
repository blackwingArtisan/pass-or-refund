import { describe, expect, it } from "vitest";
import { learnerProgress } from "@/lib/course/learner-progress";
import type { EnrollmentView } from "@/lib/course/types";

type P = Parameters<typeof learnerProgress>[0];
const attempt = (score: number) => ({ score }) as EnrollmentView["attempts"][number];
const paid = { orderId: "ORDER1", capturedCents: 4900 };
const at = (p: Partial<P>): P => ({ status: "active", attempts: [], payment: paid, refund: undefined, nextAttemptAt: null, ...p });
const states = (p: P) => learnerProgress(p, 70).map((s) => s.state);

describe("the learner's three steps: Buy, Take the test, Pass or refund", () => {
  it("marks exactly one step current until the end, and says where the learner is", () => {
    expect(states(at({ status: "unpaid", payment: undefined }))).toEqual(["current", "todo", "todo"]);
    expect(states(at({}))).toEqual(["done", "current", "todo"]);
    expect(states(at({ attempts: [attempt(45)], nextAttemptAt: "2026-11-10T00:00:00Z" }))).toEqual(["done", "current", "todo"]);
    expect(states(at({ status: "refund_pending", attempts: [attempt(45), attempt(52)] }))).toEqual(["done", "done", "current"]);
    expect(states(at({ status: "refund_review", attempts: [attempt(45), attempt(52)] }))).toEqual(["done", "done", "current"]);
    expect(states(at({ status: "under_review", attempts: [attempt(70)] }))).toEqual(["done", "done", "current"]);
    expect(states(at({ status: "passed", attempts: [attempt(88)] }))).toEqual(["done", "done", "done"]);
    expect(states(at({ status: "refunded", attempts: [attempt(45), attempt(52)] }))).toEqual(["done", "done", "done"]);
  });

  it("each step's line is read from the enrollment: the price paid, the scores, the refund", () => {
    const [buy, test, result] = learnerProgress(at({ status: "refunded", attempts: [attempt(49), attempt(52)], refund: { runId: "r", requestedAt: "", refundedCents: 4900 } }), 70);
    expect(buy.detail).toBe("$49.00 paid through PayPal");
    expect(test.detail).toBe("Tries: 49, then 52");
    expect(result.detail).toBe("Refunded: $49.00 back through PayPal");
    expect(learnerProgress(at({}), 70)[1].detail).toBe("Pass mark 70 of 100");
    expect(learnerProgress(at({ attempts: [attempt(45)], nextAttemptAt: "2026-11-10T00:00:00Z" }), 70)[1].detail).toBe("Try 1: 45. Next try after the study list");
    expect(learnerProgress(at({ attempts: [attempt(45)] }), 70)[1].detail).toBe("Try 1: 45. Try 2 is open");
  });

  it("never says PayPal took money it didn't: an unpaid purchase, and the made-up sample learner", () => {
    expect(learnerProgress(at({ status: "unpaid", payment: undefined }), 70)[0].detail).toMatch(/PayPal hasn't taken any money/);
    expect(learnerProgress(at({ status: "passed", payment: undefined, attempts: [attempt(88)] }), 70)[0].detail).toBe("Enrolled");
  });
});
