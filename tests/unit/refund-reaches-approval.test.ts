/**
 * A due refund always reaches a person, or says plainly why it couldn't. On the live site the
 * Guard's daily agent limit had been used up by test traffic, and the learner read "the refund
 * agent stopped without proposing a refund" while the model had proposed it.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApprovals } from "@/lib/agent/approvals";
import { getAuditLog } from "@/lib/agent/audit";
import { getDailyMoneyCounter, type MoneyScope } from "@/lib/agent/policy";
import { submitAttempt } from "@/lib/course/attempts";
import { requireEnrollment, saveEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { samples } from "@/lib/course/samples";
import type { GradeRun } from "@/lib/course/types";
import type { GradeOnce } from "@/lib/grading/grade";
import { resetEnvCache } from "@/lib/env";
import { getMockPayPal } from "@/lib/paypal";
import { resetSingletons } from "@/lib/singleton";
import { dataPath, writeJsonFile } from "@/lib/store/files";
import { readyForNextAttempt } from "./course-helpers";

const CHANNEL = "test";
const WAIT = { timeout: 8_000, interval: 25 };
const saved = { mode: process.env.AI_MODE, key: process.env.ANTHROPIC_API_KEY };

const failing: GradeOnce = async () => ({ total: 34, totalQuoteChecked: 34, perQuestion: {}, items: [], caps: [], injectionAttempted: false, injectionQuote: "", mocked: true, costUsd: 0 }) satisfies GradeRun;

let learners = 0;
async function dueRefund(opts: { testRun?: boolean } = {}) {
  const email = `reaches-approval${++learners}@example.com`;
  const { enrollment, orderId } = await startPurchase("Jordan Lee", email, { testRun: opts.testRun });
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

const settled = (id: string, status: string) =>
  vi.waitFor(() => {
    const enrollment = requireEnrollment(id);
    if (enrollment.status !== status) throw new Error(`Still ${enrollment.status}`);
    return enrollment;
  }, WAIT);

const today = () => new Date().toISOString().slice(0, 10);
const spendFile = (scope: MoneyScope) => dataPath(scope === "live" ? "agent-spend.json" : `agent-spend-${scope}.json`);
/** Today's agent refunds so far, as the live site had them: $1,969.00 of $2,000.00. */
const spent = (scope: MoneyScope, minor: number) => {
  writeJsonFile(spendFile(scope), { day: today(), currency: "USD", minor });
  resetSingletons(scope === "live" ? "agent:daily-money" : `agent:daily-money:${scope}`);
};

/** Claude ends its turn with a sentence and no tool call. */
const modelThatNeverProposes = () => {
  const call = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: "The policy check passed. I'll leave the refund for now." }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 50, output_tokens: 12 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", call);
  return call;
};

function liveAi() {
  process.env.AI_MODE = "live";
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
  resetEnvCache();
  resetSingletons("ai:client");
}

const SCOPES: MoneyScope[] = ["live", "test", "payments", "payments-test"];

beforeEach(() => {
  for (const scope of SCOPES) spent(scope, 0);
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.AI_MODE = saved.mode;
  process.env.ANTHROPIC_API_KEY = saved.key;
  resetEnvCache();
  resetSingletons("ai:client");
});

afterAll(() => {
  for (const scope of SCOPES) spent(scope, 0);
});

describe("a due refund reaches the course team's approval card", () => {
  it("when the model ends its turn without proposing: code proposes, a person approves, and the money moves", async () => {
    liveAi();
    const model = modelThatNeverProposes();
    const id = await dueRefund();
    const approval = await approvalOf(id);
    expect(model).toHaveBeenCalled();
    expect(requireEnrollment(id).refund).toMatchObject({ proposedWithoutAi: "The AI agent stopped without proposing a refund.", proposal: { amountValue: "49.00" } });
    expect(approval.amountValue).toBe("49.00");

    getApprovals().decide(approval.id, "approved", "course team", "Two honest fails.");
    const refunded = await settled(id, "refunded");
    expect(refunded.refund).toMatchObject({ refundStatus: "COMPLETED", refundedCents: 4900 });
    expect(refunded.refund?.refundId).toBeTruthy();
    expect(refunded.refund?.error).toBeUndefined();
  });

  it("says plainly that today's agent limit is used up, instead of 'stopped without proposing', and code doesn't try again", async () => {
    spent("live", 196_900);
    // The learner's own $49 payment still goes through: payments in have their own count.
    const id = await dueRefund();
    expect(getDailyMoneyCounter("payments").used("USD").value).toBe("49.00");
    const blocked = await settled(id, "refund_blocked");
    expect(blocked.refund?.error).toMatch(/^No money moved\. The refund didn't reach a person because today's limit on refunds the agent can propose is used up: \$49\.00 would exceed today's agent limit of \$2,000\.00 \(used \$1,969\.00\)\./);
    expect(blocked.refund?.error).not.toMatch(/stopped without proposing/);
    expect(blocked.refund?.proposedWithoutAi).toBeUndefined();
    const runId = blocked.refund!.runId;
    expect(getAuditLog().list({ runId }).filter((e) => e.action === "tool.denied").map((e) => e.reason?.split(":")[0])).toEqual(["OVER_DAILY_CAP"]);
    expect(viewEnrollment(blocked).approval).toBeNull();
  });

  it("keeps test-suite refunds on their own daily count, so they can't use up a learner's", async () => {
    spent("test", 196_900);
    const learner = await dueRefund();
    const approval = await approvalOf(learner);
    getApprovals().decide(approval.id, "approved", "course team", "ok");
    await settled(learner, "refunded");
    expect(getDailyMoneyCounter("live").used("USD").value).toBe("49.00");

    const testRun = await dueRefund({ testRun: true });
    const blocked = await settled(testRun, "refund_blocked");
    expect(blocked.refund?.error).toMatch(/today's limit/);
    saveEnrollment({ ...blocked, status: "refund_declined" });
  });
});
