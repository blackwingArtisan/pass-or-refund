import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApprovals } from "@/lib/agent/approvals";
import { submitAttempt } from "@/lib/course/attempts";
import { COURSE_PRICE_CENTS } from "@/lib/course/content";
import { requireEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { retryRefund } from "@/lib/course/refund";
import { samples } from "@/lib/course/samples";
import { gradeAttempt } from "@/lib/grading/grade";
import { getMockPayPal, getPayPal } from "@/lib/paypal";

const CHANNEL = "test";

async function buy() {
  const { enrollment, orderId } = await startPurchase("Alex Rivera");
  getMockPayPal()!.simulateBuyerApproval(orderId, { email: "buyer@example.com" });
  return completePurchase(enrollment.id, orderId, CHANNEL);
}

const waitForApproval = (id: string) =>
  vi.waitFor(() => {
    const approval = viewEnrollment(requireEnrollment(id)).approval;
    if (!approval) throw new Error("No approval yet");
    return approval;
  });

const waitForStatus = (id: string, status: string) => vi.waitFor(() => expect(requireEnrollment(id).status).toBe(status));

async function failTwice() {
  const { id } = await buy();
  await submitAttempt(id, samples.fail1, CHANNEL);
  await submitAttempt(id, samples.fail2, CHANNEL);
  return id;
}

describe("purchase", () => {
  it("takes the course price through the Guard", async () => {
    const enrollment = await buy();
    expect(enrollment.status).toBe("active");
    expect(enrollment.payment?.capturedCents).toBe(COURSE_PRICE_CENTS);
    expect(enrollment.payment?.captureStatus).toBe("COMPLETED");
  });

  it("won't capture an order the learner hasn't approved", async () => {
    const { enrollment, orderId } = await startPurchase("Alex Rivera");
    await expect(completePurchase(enrollment.id, orderId, CHANNEL)).rejects.toThrow(/didn't go through/);
    expect(requireEnrollment(enrollment.id).status).toBe("unpaid");
  });
});

describe("mock grades land where the demo needs them", () => {
  it.each([
    ["fail1", "fail", 34],
    ["fail2", "fail", 52],
    ["pass", "pass", 88],
    ["inject", "fail", 27],
    ["borderline", "review", 69],
  ] as const)("%s", async (sample, outcome, score) => {
    const graded = await gradeAttempt(samples[sample], "test");
    expect(graded).toMatchObject({ outcome, score });
    expect(graded.runs[graded.shownRun].total).toBe(score);
    expect(graded.flagged).toBe(sample === "inject");
  });

  it("grades three times only inside the band", async () => {
    expect((await gradeAttempt(samples.fail2, "test")).runs).toHaveLength(1);
    expect((await gradeAttempt(samples.borderline, "test")).runs).toHaveLength(3);
  });

  it("fails answers typed by hand", async () => {
    const graded = await gradeAttempt({ q1: "My own words.", q2: "", q3: "", q4: "" }, "test");
    expect(graded.outcome).toBe("fail");
  });
});

describe("attempts", () => {
  it("passes without touching the refund", async () => {
    const { id } = await buy();
    const passed = await submitAttempt(id, samples.pass, CHANNEL);
    expect(passed.status).toBe("passed");
    expect(passed.refund).toBeUndefined();
    await expect(submitAttempt(id, samples.fail1, CHANNEL)).rejects.toThrow(/isn't open/);
  });

  it("offers a second attempt after one fail", async () => {
    const { id } = await buy();
    const first = await submitAttempt(id, samples.fail1, CHANNEL);
    expect(first.status).toBe("active");
    expect(first.refund).toBeUndefined();
  });

  it("holds a band score for a person with no refund", async () => {
    const { id } = await buy();
    const held = await submitAttempt(id, samples.borderline, CHANNEL);
    expect(held.status).toBe("under_review");
    expect(held.refund).toBeUndefined();
  });

  it("rejects an all-blank attempt without recording it", async () => {
    const { id } = await buy();
    await expect(submitAttempt(id, { q1: " " }, CHANNEL)).rejects.toThrow(/at least one question/);
    expect(requireEnrollment(id).attempts).toHaveLength(0);
  });

  it("voids the guarantee on an injection attempt", async () => {
    const { id } = await buy();
    await submitAttempt(id, samples.inject, CHANNEL);
    await submitAttempt(id, samples.fail1, CHANNEL);
    const third = await submitAttempt(id, samples.fail2, CHANNEL);
    expect(third.status).toBe("active");
    expect(third.refund).toBeUndefined();
    expect(viewEnrollment(third).guaranteeVoid).toBe(true);
  });
});

describe("refund", () => {
  beforeEach(() => vi.useRealTimers());

  it("waits for a person, then refunds the captured amount and re-reads it", async () => {
    const id = await failTwice();
    expect(requireEnrollment(id).status).toBe("refund_pending");
    const approval = await waitForApproval(id);
    expect(approval.amountValue).toBe("49.00");

    const captureId = requireEnrollment(id).payment!.captureId!;
    expect((await getPayPal().payments.getCapture(captureId)).status).toBe("COMPLETED");

    getApprovals().decide(approval.id, "approved", "test");
    await waitForStatus(id, "refunded");

    const { refund } = requireEnrollment(id);
    expect(refund).toMatchObject({ refundStatus: "COMPLETED", refundedCents: COURSE_PRICE_CENTS, captureStatus: "REFUNDED" });
    expect(refund?.refundId).toBeTruthy();
  });

  it("moves no money on a decline, and the team can ask again", async () => {
    const id = await failTwice();
    getApprovals().decide((await waitForApproval(id)).id, "denied", "test");
    await waitForStatus(id, "refund_blocked");

    const captureId = requireEnrollment(id).payment!.captureId!;
    expect((await getPayPal().payments.getCapture(captureId)).status).toBe("COMPLETED");
    expect(requireEnrollment(id).refund?.error).toBeTruthy();

    retryRefund(id, CHANNEL);
    getApprovals().decide((await waitForApproval(id)).id, "approved", "test");
    await waitForStatus(id, "refunded");
  });

  it("won't refund a capture that isn't complete", async () => {
    const id = await failTwice();
    const approval = await waitForApproval(id);
    const paypal = getPayPal();
    const captureId = requireEnrollment(id).payment!.captureId!;
    await paypal.payments.refundCapture(captureId, undefined, { requestId: "already-refunded" });
    getApprovals().decide(approval.id, "approved", "test");
    await waitForStatus(id, "refund_blocked");
    expect(requireEnrollment(id).refund?.refundId).toBeUndefined();
  });
});
