/**
 * The refund cap against the real PayPal SANDBOX. Skipped unless SANDBOX_SMOKE=1 and credentials
 * exist (npm run test:sandbox). A mock script asks for far too much on a real capture. The
 * browser suite can't reach this path, because no real agent asks for too much on request.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseDotenv } from "@/lib/env-core";

function loadSharedCreds(): Record<string, string> | null {
  const file = path.resolve("../../.env.shared");
  if (!fs.existsSync(file)) return null;
  const env = parseDotenv(fs.readFileSync(file, "utf8"));
  return env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET ? env : null;
}

const creds = process.env.SANDBOX_SMOKE === "1" ? loadSharedCreds() : null;

describe.skipIf(!creds)("refund cap on the real sandbox", () => {
  let pp: import("@/lib/paypal").PayPalApi;

  beforeAll(async () => {
    process.env.PAYPAL_CLIENT_ID = creds!.PAYPAL_CLIENT_ID;
    process.env.PAYPAL_CLIENT_SECRET = creds!.PAYPAL_CLIENT_SECRET;
    process.env.PAYPAL_MODE = "sandbox";
    const { resetEnvCache } = await import("@/lib/env");
    const { resetSingletons } = await import("@/lib/singleton");
    resetEnvCache();
    resetSingletons("paypal:");
    pp = (await import("@/lib/paypal")).getPayPal();
    expect(pp.mode).toBe("sandbox");
  });

  it("refuses an agent that asks for too much, then a proper run pays exactly what was paid", { timeout: 90_000 }, async () => {
    const { refundAgent } = await import("@/agents/refund-agent");
    const { REFUND_COURSE_PURCHASE } = await import("@/agents/tools/refund-course-purchase");
    const { getApprovals } = await import("@/lib/agent/approvals");
    const { rubric } = await import("@/lib/course/content");
    const { createEnrollment, requireEnrollment, saveEnrollment, viewEnrollment } = await import("@/lib/course/enrollments");
    const { requestRefund, retryRefund } = await import("@/lib/course/refund");
    const { SANDBOX_TEST_CARD } = await import("@/lib/paypal/test-card");

    const order = await pp.orders.create({
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: "USD", value: "49.00" }, description: "Refund cap test" }],
      payment_source: { card: { ...SANDBOX_TEST_CARD, name: "Sandbox Buyer" } },
    });
    const captureId = order.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    expect(captureId).toBeTruthy();

    const answers = Object.fromEntries(rubric.questions.map((q) => [q.id, "An answer."]));
    const failed = { outcome: "fail" as const, score: 40, runs: [], shownRun: 0, flagged: false, injectionQuote: "", costUsd: 0, submittedAt: new Date().toISOString(), answers, reviewedStudyList: true };
    const enrollment = saveEnrollment({
      ...createEnrollment("Cap Test", `cap.${Date.now()}@example.com`),
      status: "active",
      payment: { orderId: order.id, captureId, captureStatus: "COMPLETED", capturedCents: 4_900 },
      attempts: [{ ...failed, number: 1 }, { ...failed, number: 2 }],
    });

    const greedy = { ...refundAgent(enrollment.id), mockScript: () => [{ tool: REFUND_COURSE_PURCHASE, input: { amount: "500.00", reasons: ["Asking for more than was paid."] }, pauseMs: 0 }] };
    const refundCapture = vi.spyOn(pp.payments, "refundCapture");
    await requestRefund(enrollment, "test", greedy).finished;

    expect(requireEnrollment(enrollment.id)).toMatchObject({ status: "refund_blocked", refund: { error: expect.stringContaining("$49.00") } });
    expect(refundCapture).not.toHaveBeenCalled();
    expect((await pp.payments.getCapture(captureId!)).status).toBe("COMPLETED");

    // PayPal is the second wall: even a direct call for more than the capture is refused.
    const direct = await pp.payments.refundCapture(captureId!, { amount: { currency_code: "USD", value: "500.00" } }).catch((e) => e);
    console.info(`[smoke] direct over-refund: HTTP ${direct.status} ${direct.issue}`);
    expect(direct.status).toBe(422);
    refundCapture.mockClear();

    const retried = retryRefund(enrollment.id, "test");
    const approval = await vi.waitFor(() => {
      const pending = viewEnrollment(requireEnrollment(enrollment.id)).approval;
      if (!pending) throw new Error("No approval yet");
      return pending;
    }, { timeout: 20_000, interval: 100 });
    expect(approval.amountValue).toBe("49.00");
    getApprovals().decide(approval.id, "approved", "test");
    await retried.finished;

    const { refund, status } = requireEnrollment(enrollment.id);
    expect(status).toBe("refunded");
    expect(refundCapture).toHaveBeenCalledOnce();
    const paid = await pp.payments.getRefund(refund!.refundId!);
    console.info(`[smoke] capture ${captureId}, refund ${paid.id} ${paid.status} ${paid.amount.value}`);
    // PENDING means PayPal took the refund and is funding it from the seller's bank (reason ECHECK).
    expect(["COMPLETED", "PENDING"]).toContain(paid.status);
    expect(paid.amount).toEqual({ currency_code: "USD", value: "49.00" });
    expect(refund?.refundedCents).toBe(4_900);
  });
});
