/** The rules that keep the guarantee honest, and the ways a learner could get stuck or pay twice. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApprovals } from "@/lib/agent/approvals";
import { getAuditLog } from "@/lib/agent/audit";
import { setMockOutage } from "@/lib/ai/mock-outage";
import { AiCreditError, isOutOfAiCredit } from "@/lib/ai/errors";
import { isCreditRefusal } from "@/lib/ai/client";
import { markStudyListReviewed, settleReview, skipAttemptGap, submitAttempt, tickStudyItem } from "@/lib/course/attempts";
import { activeRefunds, requireEnrollment, saveEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { answerSimilarity, ATTEMPT_GAP_HOURS, missedItems, nearCopyOf, NEAR_COPY_SIMILARITY, shortfallItems } from "@/lib/course/policy";
import { completePurchase, recoverPayment, resumePurchase, startPurchase } from "@/lib/course/purchase";
import { caughtUpWithPayPal } from "@/lib/course/recovery";
import { retryRefund } from "@/lib/course/refund";
import { samples } from "@/lib/course/samples";
import { gradeOnce, type GradeOnce } from "@/lib/grading/grade";
import { getMockPayPal, getPayPal } from "@/lib/paypal";
import { readyForNextAttempt, reviewStudyList } from "./course-helpers";

const CHANNEL = "test";
const WAIT = { timeout: 5_000, interval: 25 };

let learners = 0;
const newEmail = () => `rules-learner${++learners}@example.com`;

async function buy(email = newEmail(), payerId?: string) {
  const { enrollment, orderId } = await startPurchase("Alex Rivera", email);
  getMockPayPal()!.simulateBuyerApproval(orderId, { email: "buyer@example.com", payerId });
  return completePurchase(enrollment.id, orderId, CHANNEL);
}

async function failTwice(id: string) {
  await submitAttempt(id, samples.fail1, CHANNEL);
  readyForNextAttempt(id);
  return submitAttempt(id, samples.fail2, CHANNEL);
}

const approvalOf = (id: string) =>
  vi.waitFor(() => {
    const approval = viewEnrollment(requireEnrollment(id)).approval;
    if (!approval) throw new Error("No approval yet");
    return approval;
  }, WAIT);

const statusOf = (id: string, status: string) => vi.waitFor(() => expect(requireEnrollment(id).status).toBe(status), WAIT);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  setMockOutage(null);
});

describe("a near-copy of an earlier attempt", () => {
  const changeOneWord = (answers: Record<string, string>) => ({ ...answers, q1: answers.q1.replace(/\w+/, "Honestly") });
  const shuffle = (answers: Record<string, string>) => Object.fromEntries(Object.entries(answers).map(([id, text]) => [id, text.split(" ").reverse().join(" ")]));

  it("catches a changed word, a shuffle and a change of case", () => {
    expect(answerSimilarity(samples.fail1, changeOneWord(samples.fail1))).toBeGreaterThanOrEqual(NEAR_COPY_SIMILARITY);
    expect(answerSimilarity(samples.fail1, shuffle(samples.fail1))).toBeGreaterThanOrEqual(NEAR_COPY_SIMILARITY);
    expect(answerSimilarity(samples.fail1, Object.fromEntries(Object.entries(samples.fail1).map(([id, text]) => [id, text.toUpperCase()])))).toBe(1);
  });

  it("leaves real rewrites alone", () => {
    expect(answerSimilarity(samples.fail1, samples.fail2)).toBeLessThan(NEAR_COPY_SIMILARITY);
    expect(nearCopyOf(samples.fail2, [{ number: 1, answers: samples.fail1 }])).toBeUndefined();
  });

  it("is graded, but doesn't count toward a refund", async () => {
    const { id } = await buy();
    await submitAttempt(id, samples.fail1, CHANNEL);
    readyForNextAttempt(id);
    const copy = await submitAttempt(id, changeOneWord(samples.fail1), CHANNEL);
    expect(copy.status).toBe("active");
    expect(copy.refund).toBeUndefined();
    expect(copy.attempts[1]).toMatchObject({ nearCopyOf: 1, reviewedStudyList: true, outcome: "fail" });
    expect(viewEnrollment(copy).completedFails).toBe(1);
    expect(viewEnrollment(copy).guarantee.due).toBe(false);
  });

  it("compares with every earlier attempt, not just the last", async () => {
    const { id } = await buy();
    await submitAttempt(id, samples.fail1, CHANNEL);
    readyForNextAttempt(id);
    await submitAttempt(id, samples.inject, CHANNEL);
    readyForNextAttempt(id);
    const back = await submitAttempt(id, samples.fail1, CHANNEL);
    expect(back.attempts[2].nearCopyOf).toBe(1);
  });
});

describe("the gap between attempts", () => {
  it("holds the next attempt back and says when it opens", async () => {
    const { id } = await buy();
    const failed = await submitAttempt(id, samples.fail1, CHANNEL);
    const opens = viewEnrollment(failed).nextAttemptAt!;
    expect(Date.parse(opens) - Date.parse(failed.attempts[0].submittedAt)).toBe(ATTEMPT_GAP_HOURS * 3_600_000);
    await expect(submitAttempt(id, samples.fail2, CHANNEL)).rejects.toMatchObject({ status: 409, code: "attempt_gap" });
    expect(requireEnrollment(id).attempts).toHaveLength(1);
  });

  it("lets judges skip it, once per attempt, and logs that they did", async () => {
    const { id } = await buy();
    await submitAttempt(id, samples.fail1, CHANNEL);
    expect(viewEnrollment(skipAttemptGap(id)).nextAttemptAt).toBeNull();
    expect(getAuditLog().list().some((entry) => entry.action === "attempt.wait_skipped" && entry.reason?.includes(id))).toBe(true);
    const second = await submitAttempt(id, samples.inject, CHANNEL);
    expect(viewEnrollment(second).nextAttemptAt).not.toBeNull();
  });

  it("opens by itself once the time is up", async () => {
    const { id } = await buy();
    await submitAttempt(id, samples.fail1, CHANNEL);
    vi.useFakeTimers({ now: Date.now() + ATTEMPT_GAP_HOURS * 3_600_000 + 1_000, toFake: ["Date"] });
    expect(viewEnrollment(requireEnrollment(id)).nextAttemptAt).toBeNull();
    expect((await submitAttempt(id, samples.inject, CHANNEL)).attempts).toHaveLength(2);
  });

  it("doesn't apply before a first attempt", async () => {
    const enrollment = await buy();
    expect(viewEnrollment(enrollment).nextAttemptAt).toBeNull();
  });
});

describe("one refund per learner", () => {
  it("stops a new email on the same PayPal account from a second refund", async () => {
    const first = await buy(newEmail(), "SAMEPAYER001");
    await failTwice(first.id);
    getApprovals().decide((await approvalOf(first.id)).id, "approved", "test");
    await statusOf(first.id, "refunded");

    const second = await buy(newEmail(), "SAMEPAYER001");
    const after = await failTwice(second.id);
    expect(after.status).toBe("active");
    expect(after.refund).toBeUndefined();
    expect(viewEnrollment(after).guarantee.checks.find((c) => c.rule === "one_refund_per_learner")?.passed).toBe(false);
  });

  it("keeps a different PayPal account and email separate", async () => {
    const first = await buy(newEmail(), "PAYERONE0001");
    await failTwice(first.id);
    getApprovals().decide((await approvalOf(first.id)).id, "approved", "test");
    await statusOf(first.id, "refunded");

    const second = await buy(newEmail(), "PAYERTWO0002");
    expect((await failTwice(second.id)).status).toBe("refund_pending");
    getApprovals().decide((await approvalOf(second.id)).id, "denied", "test", "Not needed");
    await statusOf(second.id, "refund_declined");
  });

  it("doesn't merge guest card buyers, who have no payer id", async () => {
    const { enrollment, orderId } = await startPurchase("Alex Rivera", newEmail());
    const order = await getPayPal().orders.get(orderId);
    vi.spyOn(getPayPal().orders, "get").mockResolvedValue({ ...order, status: "APPROVED", payer: undefined, payment_source: { card: {} } });
    vi.spyOn(getPayPal().orders, "capture").mockResolvedValue({ ...order, status: "COMPLETED", purchase_units: [{ ...order.purchase_units![0], payments: { captures: [{ id: "CARDCAPTURE01", status: "COMPLETED", amount: { currency_code: "USD", value: "49.00" } } as never] } }] });
    const paid = await completePurchase(enrollment.id, orderId, CHANNEL);
    expect(paid.payment?.payerId).toBeUndefined();
  });
});

describe("the study list", () => {
  it("can't be marked reviewed in one go", async () => {
    const { id } = await buy();
    const failed = await submitAttempt(id, samples.fail1, CHANNEL);
    const [first, ...rest] = missedItems(failed.attempts[0]);
    expect(rest.length).toBeGreaterThan(0);
    expect(() => markStudyListReviewed(id)).toThrow(/still to review/);
    tickStudyItem(id, first.id);
    expect(() => markStudyListReviewed(id)).toThrow(`${rest.length} study list`);
    expect(requireEnrollment(id).reviewedAttempt).toBeUndefined();
    expect(reviewStudyList(id).reviewedAttempt).toBe(1);
  });

  it("only takes items that are on the list, and starts clean after each attempt", async () => {
    const { id } = await buy();
    await submitAttempt(id, samples.fail1, CHANNEL);
    expect(() => tickStudyItem(id, "nope")).toThrow(/isn't on your study list/);
    readyForNextAttempt(id);
    const next = await submitAttempt(id, samples.inject, CHANNEL);
    expect(next.studyTicks).toEqual([]);
  });
});

describe("a person settles a 69-70 attempt", () => {
  const heldAttempt = async () => {
    const { id } = await buy();
    const held = await submitAttempt(id, samples.borderline, CHANNEL);
    expect(held.status).toBe("under_review");
    return { id, items: shortfallItems(held.attempts[0]).map((item) => item.id) };
  };
  const person = { by: "course team", note: "Answers show the idea, in their own words." };

  it("needs every item checked first", async () => {
    const { id, items } = await heldAttempt();
    expect(items.length).toBeGreaterThan(1);
    expect(() => settleReview(id, { ...person, outcome: "pass", checkedItems: items.slice(1) }, CHANNEL)).toThrow(/still to check/);
    expect(requireEnrollment(id).status).toBe("under_review");
  });

  it("passes the learner on a pass, keeps the graded score, and logs who decided", async () => {
    const { id, items } = await heldAttempt();
    const settled = settleReview(id, { ...person, outcome: "pass", checkedItems: items }, CHANNEL);
    expect(settled.status).toBe("passed");
    expect(settled.attempts[0]).toMatchObject({ outcome: "pass", score: 69, settled: { outcome: "pass", by: "course team", checkedItems: items } });
    expect(getAuditLog().list().some((entry) => entry.action === "review.settled" && entry.actor === "course team" && entry.reason?.includes(id))).toBe(true);
    expect(() => settleReview(id, { ...person, outcome: "fail", checkedItems: items }, CHANNEL)).toThrow(/no attempt waiting/);
  });

  it("lets the learner try again after a first fail", async () => {
    const { id, items } = await heldAttempt();
    const settled = settleReview(id, { ...person, outcome: "fail", checkedItems: items }, CHANNEL);
    expect(settled.status).toBe("active");
    expect(viewEnrollment(settled).completedFails).toBe(1);
    expect(viewEnrollment(settled).nextAttemptAt).not.toBeNull();
  });

  it("sends a second fail to the refund approval, not straight to the money", async () => {
    const refundCapture = vi.spyOn(getPayPal().payments, "refundCapture");
    const { id } = await buy();
    await submitAttempt(id, samples.fail1, CHANNEL);
    readyForNextAttempt(id);
    const held = await submitAttempt(id, samples.borderline, CHANNEL);
    const settled = settleReview(id, { ...person, outcome: "fail", checkedItems: shortfallItems(held.attempts[1]).map((item) => item.id) }, CHANNEL);
    expect(settled.status).toBe("refund_pending");
    const approval = await approvalOf(id);
    expect(refundCapture).not.toHaveBeenCalled();
    getApprovals().decide(approval.id, "denied", "test", "No");
    await statusOf(id, "refund_declined");
  });
});

describe("the app stops between PayPal paying and our record", () => {
  /** The buyer said yes and PayPal took the money, and our record never heard. */
  async function paidBehindTheApp(email = newEmail()) {
    const { enrollment, orderId } = await startPurchase("Alex Rivera", email);
    getMockPayPal()!.simulateBuyerApproval(orderId, { email: "buyer@example.com" });
    await getPayPal().orders.capture(orderId);
    expect(requireEnrollment(enrollment.id).status).toBe("unpaid");
    return { id: enrollment.id, orderId, email };
  }

  it("rebuilds the record from PayPal when the learner comes back", async () => {
    const { id } = await paidBehindTheApp();
    const recovered = await caughtUpWithPayPal(requireEnrollment(id));
    expect(recovered).toMatchObject({ status: "active", payment: { recovered: true, captureStatus: "COMPLETED", capturedCents: 4_900 } });
  });

  it("gets a learner who buys again into the course without a second payment", async () => {
    const { id, email } = await paidBehindTheApp();
    const create = vi.spyOn(getPayPal().orders, "create");
    const resumed = await resumePurchase(email.toUpperCase(), CHANNEL);
    expect(resumed?.id).toBe(id);
    expect(create).not.toHaveBeenCalled();
  });

  it("finishes an approved order the app never captured", async () => {
    const email = newEmail();
    const { enrollment, orderId } = await startPurchase("Alex Rivera", email);
    getMockPayPal()!.simulateBuyerApproval(orderId, { email: "buyer@example.com" });
    const resumed = await resumePurchase(email, CHANNEL);
    expect(resumed).toMatchObject({ id: enrollment.id, status: "active", payment: { captureStatus: "COMPLETED" } });
  });

  it("answers a repeated pay request with the same enrollment and no second capture", async () => {
    const { id, orderId } = await paidBehindTheApp();
    const capture = vi.spyOn(getPayPal().orders, "capture");
    const first = await completePurchase(id, orderId, CHANNEL);
    const second = await completePurchase(id, orderId, CHANNEL);
    expect(first.payment?.captureId).toBeTruthy();
    expect(second.payment?.captureId).toBe(first.payment?.captureId);
    expect(capture).not.toHaveBeenCalled();
  });

  it("leaves an abandoned checkout alone", async () => {
    const email = newEmail();
    const { enrollment } = await startPurchase("Alex Rivera", email);
    expect(await resumePurchase(email, CHANNEL)).toBeNull();
    expect((await recoverPayment(requireEnrollment(enrollment.id))).status).toBe("unpaid");
  });

  it("records a refund PayPal paid, without paying it twice", async () => {
    const { id } = await buy();
    await failTwice(id);
    await approvalOf(id);
    const { payment } = requireEnrollment(id);
    await getPayPal().payments.refundCapture(payment!.captureId!);
    activeRefunds().delete(id);
    const refundCapture = vi.spyOn(getPayPal().payments, "refundCapture");

    const recovered = await caughtUpWithPayPal(requireEnrollment(id));
    expect(recovered).toMatchObject({ status: "refunded", refund: { refundStatus: "COMPLETED", refundedCents: 4_900, captureStatus: "REFUNDED" } });
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it("reads a refund back when someone looks, if the first read never happened", async () => {
    const { id } = await buy();
    await failTwice(id);
    getApprovals().decide((await approvalOf(id)).id, "approved", "test");
    await statusOf(id, "refunded");
    await vi.waitFor(() => expect(activeRefunds().has(id)).toBe(false), WAIT);
    const enrollment = requireEnrollment(id);
    saveEnrollment({ ...enrollment, refund: { ...enrollment.refund!, captureStatus: undefined, rereadAt: undefined } });

    const refundCapture = vi.spyOn(getPayPal().payments, "refundCapture");
    const seen = await caughtUpWithPayPal(requireEnrollment(id));
    expect(seen.refund).toMatchObject({ refundStatus: "COMPLETED", captureStatus: "REFUNDED", rereadAt: expect.any(String) });
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it("does the same when a person approves and the refund turns out to be paid already", async () => {
    const { id } = await buy();
    await failTwice(id);
    const approval = await approvalOf(id);
    await getPayPal().payments.refundCapture(requireEnrollment(id).payment!.captureId!);
    getApprovals().decide(approval.id, "approved", "test");
    await statusOf(id, "refund_blocked");
    await vi.waitFor(() => expect(activeRefunds().has(id)).toBe(false), WAIT);

    const refundCapture = vi.spyOn(getPayPal().payments, "refundCapture");
    const { enrollment } = await retryRefund(id, CHANNEL);
    expect(enrollment).toMatchObject({ status: "refunded", refund: { refundStatus: "COMPLETED", error: undefined } });
    expect(refundCapture).not.toHaveBeenCalled();
  });
});

describe("when the model is unavailable", () => {
  /** Grading was fine, then the model went away before the refund agent started. */
  const gradedThenLost = (mode: "down" | "credit"): GradeOnce => async (...args) => {
    const run = await gradeOnce(...args);
    setMockOutage(mode);
    return run;
  };

  it("still sends a due refund to a person, with reasons built by code, and the refund works", async () => {
    const { id } = await buy();
    await submitAttempt(id, samples.fail1, CHANNEL);
    readyForNextAttempt(id);
    await submitAttempt(id, samples.fail2, CHANNEL, gradedThenLost("down"));
    expect(requireEnrollment(id).status).toBe("refund_pending");
    const approval = await approvalOf(id);
    const { refund } = requireEnrollment(id);
    expect(refund?.proposedWithoutAi).toBe("The AI model wasn't available.");
    expect(refund?.proposal?.reasons.join(" ")).toMatch(/couldn't run, so code built this proposal/);
    expect(approval.amountValue).toBe("49.00");
    getApprovals().decide(approval.id, "approved", "test");
    await statusOf(id, "refunded");
    expect(requireEnrollment(id).refund?.refundStatus).toBe("COMPLETED");
  });

  it("says the credit ran out when that's why", async () => {
    const { id } = await buy();
    await submitAttempt(id, samples.fail1, CHANNEL);
    readyForNextAttempt(id);
    await submitAttempt(id, samples.fail2, CHANNEL, gradedThenLost("credit"));
    const approval = await approvalOf(id);
    expect(requireEnrollment(id).refund?.proposedWithoutAi).toBe("The AI credit has run out.");
    getApprovals().decide(approval.id, "denied", "test", "Done");
    await statusOf(id, "refund_declined");
  });

  it("keeps the attempt out of the record and says so plainly when grading is down", async () => {
    const { id } = await buy();
    setMockOutage("down");
    await expect(submitAttempt(id, samples.fail1, CHANNEL)).rejects.toMatchObject({ status: 503, code: "ai_unavailable", message: expect.stringContaining("nothing was counted") });
    setMockOutage("credit");
    await expect(submitAttempt(id, samples.fail1, CHANNEL)).rejects.toMatchObject({ status: 402, code: "ai_credit", message: expect.stringContaining("run out of AI grading credit") });
    expect(requireEnrollment(id).attempts).toHaveLength(0);
    setMockOutage(null);
    expect((await submitAttempt(id, samples.fail1, CHANNEL)).attempts).toHaveLength(1);
  });

  it("knows Anthropic's out-of-credit refusal when it sees one", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const refusal = new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }, undefined, new Headers());
    expect(isCreditRefusal(refusal)).toBe(true);
    expect(isCreditRefusal(new Error("overloaded"))).toBe(false);
    expect(isOutOfAiCredit(new AiCreditError())).toBe(true);
  });
});
