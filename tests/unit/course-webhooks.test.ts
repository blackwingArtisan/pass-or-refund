import { afterEach, describe, expect, it, vi } from "vitest";
import { getApprovals } from "@/lib/agent/approvals";
import { submitAttempt } from "@/lib/course/attempts";
import { requireEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { completePurchase, resumePurchase, startPurchase } from "@/lib/course/purchase";
import { samples } from "@/lib/course/samples";
import { enrollmentChannel, TEAM_CHANNEL } from "@/lib/course/scope";
import { timeline } from "@/lib/events/bus";
import { getMockPayPal, getPayPal } from "@/lib/paypal";
import { readyForNextAttempt } from "./course-helpers";

const CHANNEL = "test";
const WAIT = { timeout: 8_000, interval: 25 };

let learners = 0;

async function buy() {
  const email = `hook${++learners}@example.com`;
  const { enrollment, orderId } = await startPurchase("Alex Rivera", email);
  getMockPayPal()!.simulateBuyerApproval(orderId, { email: `paypal.${email}` });
  return completePurchase(enrollment.id, orderId, CHANNEL);
}

const waitForApproval = (id: string) =>
  vi.waitFor(() => {
    const approval = viewEnrollment(requireEnrollment(id)).approval;
    if (!approval) throw new Error("No approval yet");
    return approval;
  }, WAIT);

async function failOnce(id: string) {
  await submitAttempt(id, samples.fail1, CHANNEL);
  readyForNextAttempt(id);
}

const webhooksOn = (channel: string) => timeline.history({ channels: [channel] }).filter((e) => e.kind === "webhook");

afterEach(() => getMockPayPal()!.holdRefunds(false));

describe("PayPal's webhooks settle the course's records", () => {
  it("PAYMENT.CAPTURE.COMPLETED confirms the payment", async () => {
    const { id } = await buy();
    await vi.waitFor(() => expect(requireEnrollment(id).payment?.webhookAt).toBeTruthy(), WAIT);
  });

  it("PAYMENT.CAPTURE.COMPLETED enrolls a learner whose record missed the payment", async () => {
    const { enrollment, orderId } = await startPurchase("Rob Stuck", `hook${++learners}@example.com`);
    getMockPayPal()!.simulateBuyerApproval(orderId, { email: "stuck@example.com" });
    await getPayPal().orders.capture(orderId); // PayPal took the money; our record never heard
    expect(requireEnrollment(enrollment.id).status).toBe("unpaid");
    await vi.waitFor(() => expect(requireEnrollment(enrollment.id)).toMatchObject({ status: "active", payment: { recovered: true } }), WAIT);
    await vi.waitFor(() => expect(requireEnrollment(enrollment.id).payment?.webhookAt).toBeTruthy(), WAIT);    // Buying again takes them back to it, with no second charge.
    expect((await resumePurchase(enrollment.learnerEmail, CHANNEL))?.id).toBe(enrollment.id);
  });

  it("a PENDING refund settles from PAYMENT.CAPTURE.REFUNDED, with no polling", async () => {
    getMockPayPal()!.holdRefunds(true);
    const { id } = await buy();
    await failOnce(id);
    await submitAttempt(id, samples.fail2, CHANNEL);
    getApprovals().decide((await waitForApproval(id)).id, "approved", "test");
    await vi.waitFor(() => expect(requireEnrollment(id)).toMatchObject({ status: "refunded", refund: { refundStatus: "PENDING", refundStatusReason: "ECHECK" } }), WAIT);
    const reread = requireEnrollment(id).refund!.rereadAt;
    expect(requireEnrollment(id).refund?.webhookAt).toBeUndefined();

    await getMockPayPal()!.releaseHeldRefunds();
    await vi.waitFor(() => expect(requireEnrollment(id).refund).toMatchObject({ refundStatus: "COMPLETED", webhookStatus: "COMPLETED", captureStatus: "REFUNDED" }), WAIT);
    expect(requireEnrollment(id).refund?.webhookAt).toBeTruthy();
    // The read-back after it is the webhook's, well inside the 30 s a learner's view waits between reads.
    expect(Date.parse(requireEnrollment(id).refund!.rereadAt!) - Date.parse(reread!)).toBeLessThan(10_000);
  });

  it("each webhook reaches the course team and its own learner, and no other learner", async () => {
    const mine = await buy();
    const theirs = await buy();
    await vi.waitFor(() => expect(requireEnrollment(mine.id).payment?.webhookAt).toBeTruthy(), WAIT);
    await vi.waitFor(() => expect(requireEnrollment(theirs.id).payment?.webhookAt).toBeTruthy(), WAIT);
    const capturedFor = (channel: string) => webhooksOn(channel).map((e) => ((e.data as { event: { resource: { id: string } } }).event.resource.id));
    expect(capturedFor(enrollmentChannel(mine.id))).toContain(mine.payment!.captureId);
    expect(capturedFor(enrollmentChannel(mine.id))).not.toContain(theirs.payment!.captureId);
    expect(capturedFor(TEAM_CHANNEL)).toEqual(expect.arrayContaining([mine.payment!.captureId, theirs.payment!.captureId]));
    expect(webhooksOn("global")).toHaveLength(0);
  });
});

describe("a learner's PayPal dispute", () => {
  it("is attached to its enrollment, and nothing is proposed while the guarantee doesn't cover it", async () => {
    const { id, payment } = await buy();
    await failOnce(id);
    await getMockPayPal()!.simulateDispute({ captureId: payment!.captureId! });
    await vi.waitFor(() => expect(requireEnrollment(id).dispute?.note).toMatch(/doesn't cover this yet/), WAIT);
    expect(requireEnrollment(id)).toMatchObject({ status: "active", dispute: { status: "WAITING_FOR_SELLER_RESPONSE", amountCents: 4900 } });
    expect(viewEnrollment(requireEnrollment(id)).approval).toBeNull();
  });

  it("once a refund is due, the agent proposes accepting it, and only a person's approval pays it", async () => {
    const { id, payment } = await buy();
    await failOnce(id);
    await getMockPayPal()!.simulateDispute({ captureId: payment!.captureId! });
    await vi.waitFor(() => expect(requireEnrollment(id).dispute).toBeTruthy(), WAIT);

    await submitAttempt(id, samples.fail2, CHANNEL);
    const approval = await waitForApproval(id);
    expect(approval.summary).toMatch(/Accept .* PayPal dispute and refund \$49\.00/);
    expect(getApprovals().get(approval.id)?.tool).toBe("accept_dispute_claim");
    expect(requireEnrollment(id).refund?.proposal?.reasons.join(" ")).toMatch(/PayPal dispute/);
    expect((await getPayPal().payments.getCapture(payment!.captureId!)).status).toBe("COMPLETED");

    getApprovals().decide(approval.id, "approved", "test");
    await vi.waitFor(() => expect(requireEnrollment(id)).toMatchObject({ status: "refunded", refund: { refundStatus: "COMPLETED", captureStatus: "REFUNDED", refundedCents: 4900 } }), WAIT);
    const { refund, dispute } = requireEnrollment(id);
    expect(refund?.viaDispute).toBe(dispute?.id);
    expect(refund?.refundId).toBeTruthy();
    await vi.waitFor(() => expect(requireEnrollment(id).dispute).toMatchObject({ status: "RESOLVED", outcome: "RESOLVED_BUYER_FAVOUR" }), WAIT);
    expect((await getPayPal().disputes.get(dispute!.id)).status).toBe("RESOLVED");
  });

  it("a dispute on a passing learner proposes nothing", async () => {
    const { id, payment } = await buy();
    await submitAttempt(id, samples.pass, CHANNEL);
    await getMockPayPal()!.simulateDispute({ captureId: payment!.captureId! });
    await vi.waitFor(() => expect(requireEnrollment(id).dispute?.note).toMatch(/doesn't cover/), WAIT);
    expect(requireEnrollment(id).status).toBe("passed");
    expect(viewEnrollment(requireEnrollment(id)).approval).toBeNull();
  });
});
