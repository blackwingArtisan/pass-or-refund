/** The real Claude path with the network answering badly: a due refund still reaches a person. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getApprovals } from "@/lib/agent/approvals";
import { submitAttempt } from "@/lib/course/attempts";
import { rubric } from "@/lib/course/content";
import { requireEnrollment, saveEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { samples } from "@/lib/course/samples";
import type { GradeRun } from "@/lib/course/types";
import type { GradeOnce } from "@/lib/grading/grade";
import { resetEnvCache } from "@/lib/env";
import { getMockPayPal } from "@/lib/paypal";
import { timeline } from "@/lib/events/bus";
import { mockGrade } from "@/lib/grading/mock";
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
async function dueRefund(contested = false) {
  const email = `model-down${++learners}@example.com`;
  const { enrollment, orderId } = await startPurchase("Alex Rivera", email);
  getMockPayPal()!.simulateBuyerApproval(orderId, { email: `paypal.${email}` });
  const { id } = await completePurchase(enrollment.id, orderId, CHANNEL);
  await submitAttempt(id, samples.fail1, CHANNEL, failing);
  readyForNextAttempt(id);
  if (contested) {
    const at = new Date().toISOString();
    const itemId = rubric.questions[0].items[0].id;
    saveEnrollment({ ...requireEnrollment(id), contest: { attempt: 1, itemId, note: "I did explain it.", at, ruling: { upheld: false, note: "Not met.", by: "course team", at, scoreBefore: 34, scoreAfter: 34 } } });
  }
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

  it("says code ran the fallback, not a mock, when AI is live", async () => {
    anthropicAnswers(401, "authentication_error", "invalid x-api-key");
    const id = await dueRefund();
    const approval = await approvalOf(id);
    const runs = timeline.history({ channels: [CHANNEL] }).filter((e) => e.kind === "run");
    expect(runs.some((e) => e.subtitle === "run by code: the AI model couldn't")).toBe(true);
    expect(JSON.stringify(runs)).not.toMatch(/mock/i);
    getApprovals().decide(approval.id, "denied", "test", "Done");
  });

  it("proposes a contested case straight to a person when the model is out, with notes code wrote", async () => {
    anthropicAnswers(529, "overloaded_error", "Overloaded");
    const id = await dueRefund(true);
    const approval = await approvalOf(id);
    const { refund, status } = requireEnrollment(id);
    expect(status).toBe("refund_pending");
    expect(refund?.review).toBeUndefined();
    expect(refund?.proposedWithoutAi).toBeTruthy();
    expect(refund?.proposal?.teamSummary).toMatch(/contested/);
    expect(refund?.proposal?.learnerNote).toMatch(/^Sorry/);
    getApprovals().decide(approval.id, "denied", "test", "Done");
  });
});

describe("the recorded grade for an answer typed by hand", () => {
  it("quotes a different phrase of the answer on each line, word for word", () => {
    const answer = "Honing sharpens the knife. Her brother is right, she should hone it for longer every Sunday.";
    const grade = mockGrade({ q1: answer, q2: "", q3: "", q4: "" }, 0);
    const q1 = grade.items.filter((item) => item.id.startsWith("q1"));
    for (const item of q1) expect(answer).toContain(item.quote);
    expect(new Set(q1.map((item) => item.quote)).size).toBeGreaterThan(1);
  });
});
