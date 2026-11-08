/** The real Claude path with the network answering badly: a due refund still reaches a person. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getApprovals } from "@/lib/agent/approvals";
import { submitAttempt } from "@/lib/course/attempts";
import { requireEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { samples } from "@/lib/course/samples";
import type { GradeRun } from "@/lib/course/types";
import type { GradeOnce } from "@/lib/grading/grade";
import { resetEnvCache } from "@/lib/env";
import { getMockPayPal } from "@/lib/paypal";
import { resetSingletons } from "@/lib/singleton";
import { readyForNextAttempt } from "./course-helpers";

const CHANNEL = "test";
const WAIT = { timeout: 5_000, interval: 25 };
const saved = { mode: process.env.AI_MODE, key: process.env.ANTHROPIC_API_KEY };

const failing: GradeOnce = async () => ({ total: 34, totalQuoteChecked: 34, perQuestion: {}, items: [], caps: [], injectionAttempted: false, injectionQuote: "", mocked: true, costUsd: 0 }) satisfies GradeRun;

const anthropicAnswers = (status: number, type: string, message: string) => {
  const call = vi.fn(async () => new Response(JSON.stringify({ type: "error", error: { type, message } }), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", call);
  return call;
};

let learners = 0;
async function dueRefund() {
  const email = `model-down${++learners}@example.com`;
  const { enrollment, orderId } = await startPurchase("Alex Rivera", email);
  getMockPayPal()!.simulateBuyerApproval(orderId, { email: `paypal.${email}` });
  const { id } = await completePurchase(enrollment.id, orderId, CHANNEL);
  await submitAttempt(id, samples.fail1, CHANNEL, failing);
  readyForNextAttempt(id);
  await submitAttempt(id, samples.fail2, CHANNEL, failing);
  return id;
}

const approvalOf = (id: string) =>
  vi.waitFor(() => {
    const approval = viewEnrollment(requireEnrollment(id)).approval;
    if (!approval) throw new Error("No approval yet");
    return approval;
  }, WAIT);

beforeAll(() => {
  process.env.AI_MODE = "live";
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
  resetEnvCache();
});

beforeEach(() => {
  vi.unstubAllGlobals();
  resetSingletons("ai:client");
});

afterAll(() => {
  vi.unstubAllGlobals();
  process.env.AI_MODE = saved.mode;
  process.env.ANTHROPIC_API_KEY = saved.key;
  resetEnvCache();
  resetSingletons("ai:client");
});

describe("the refund agent on the real Claude path", () => {
  it("falls back when Anthropic says the credit has run out", async () => {
    const anthropic = anthropicAnswers(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.");
    const id = await dueRefund();
    const approval = await approvalOf(id);
    expect(anthropic).toHaveBeenCalled();
    expect(requireEnrollment(id).refund?.proposedWithoutAi).toBe("The AI credit has run out.");
    expect(approval.amountValue).toBe("49.00");
    getApprovals().decide(approval.id, "denied", "test", "Done");
  });

  it("falls back when Anthropic won't take the call", async () => {
    anthropicAnswers(401, "authentication_error", "invalid x-api-key");
    const id = await dueRefund();
    const approval = await approvalOf(id);
    expect(requireEnrollment(id).refund?.proposedWithoutAi).toBe("The AI model wasn't available.");
    expect(requireEnrollment(id).refund?.proposal?.reasons.join(" ")).toMatch(/code built this proposal/);
    getApprovals().decide(approval.id, "denied", "test", "Done");
  });
});
