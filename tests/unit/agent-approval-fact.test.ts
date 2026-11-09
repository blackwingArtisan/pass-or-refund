import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// The model is replaced by a script of replies, so the test controls exactly what it says.
const replies: unknown[] = [];
const sent: { messages: { role: string; content: unknown }[]; system: string }[] = [];
vi.mock("@/lib/ai/client", () => ({
  guardedClaudeCall: vi.fn(async (params: { messages: { role: string; content: unknown }[]; system: string }) => {
    sent.push({ messages: structuredClone(params.messages), system: params.system });
    return { message: replies.shift(), costUsd: 0 };
  }),
}));

import { appConfig } from "@/app.config";
import { ApprovalService } from "@/lib/agent/approvals";
import { AuditLog } from "@/lib/agent/audit";
import { approvalFact, CLAIMS_NO_APPROVAL, withApprovalFact } from "@/lib/agent/execute";
import { Guard } from "@/lib/agent/guard";
import { IdempotencyStore } from "@/lib/agent/idempotency";
import { runClaudeAgent } from "@/lib/agent/loop";
import { DailyMoneyCounter, describePolicy } from "@/lib/agent/policy";
import { runScriptedAgent } from "@/lib/agent/scripted";
import { defineTool } from "@/lib/agent/tool";
import { money } from "@/lib/money";
import { MockPayPal } from "@/lib/paypal/mock";

/** What live Haiku wrote on the hosted take, after a person had clicked Approve. */
const CONTRADICTION = "The tool went through without pausing for a person's approval, even though the guard notes said refunds above 49.00 need one, and the amount was exactly 49.00.";

let approvals: ApprovalService;
let guard: Guard;

/** A refund at exactly the app's approval threshold, under the app's own Guard policy. */
function refundTool() {
  const execute = vi.fn(async () => ({ refund_id: "1HS793997Y972652D", status: "COMPLETED" }));
  const tool = defineTool({
    name: "refund_course_purchase",
    description: "Refund the learner",
    risk: "money",
    schema: z.object({ amount: z.string() }),
    impact: async (i) => ({ amount: money(i.amount), summary: `Refund ${i.amount}` }),
    execute: execute as never,
  });
  return { tool, execute };
}

const approveNext = () => {
  const off = approvals.onChange((a) => {
    if (a.state === "pending") {
      off();
      setTimeout(() => approvals.decide(a.id, "approved", "course team"), 5);
    }
  });
};

beforeEach(() => {
  replies.length = 0;
  sent.length = 0;
  approvals = new ApprovalService();
  guard = new Guard({ paypal: new MockPayPal(), policy: appConfig.agentPolicy, approvals, audit: new AuditLog(null), idempotency: new IdempotencyStore(null), daily: new DailyMoneyCounter(null) });
});

describe("the Guard on a refund at exactly the approval threshold", () => {
  it("still waits for a person: refund_course_purchase always needs approval, at any amount", async () => {
    const { tool, execute } = refundTool();
    expect(appConfig.agentPolicy.approvalThreshold).toBe("49.00");
    approveNext();
    const out = await guard.run(tool, { amount: "49.00" }, { runId: "run-t", actor: "agent:test", channel: "test" });
    expect(out.status).toBe("executed");
    expect(out.approval).toMatchObject({ state: "approved", decidedBy: "course team" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("tells the model the always-approval rule first, so the threshold line can't be read as covering refunds", () => {
    const words = describePolicy(guard.policy);
    expect(words).toContain("These tools always wait for a person's approval, at any amount: refund_course_purchase, accept_dispute_claim.");
    expect(words.indexOf("always wait")).toBeLessThan(words.indexOf("Other money movements above 49.00"));
  });
});

describe("the agent's words after a person approved its refund", () => {
  const agent = (tool: ReturnType<typeof refundTool>["tool"]) => ({ id: "refund-agent", name: "Refund agent", description: "", system: "Refund the learner.", tools: () => [tool] });

  it("can't say the refund went through without approval: code states who approved it, and drops the false sentence", async () => {
    const { tool } = refundTool();
    replies.push(
      { content: [{ type: "text", text: "Proposing the refund of 49.00 for a person to approve." }, { type: "tool_use", id: "tu_1", name: "refund_course_purchase", input: { amount: "49.00" } }], stop_reason: "tool_use" },
      { content: [{ type: "text", text: `${CONTRADICTION} Refund 1HS793997Y972652D is COMPLETED.` }], stop_reason: "end_turn" },
    );
    approveNext();
    const result = await runClaudeAgent({ runId: "run-live", channel: "test", def: agent(tool) as never, input: { goal: "Refund if due." }, guard });

    // What the model was told: the tool result carries the person's approval, in code's words.
    const toolResult = JSON.stringify(sent[1].messages.at(-1)!.content);
    expect(toolResult).toContain("person_approval");
    expect(toolResult).toMatch(/approval_id.*by.*course team.*at/);
    expect(toolResult).toContain("Approved by course team");
    expect(sent[0].system).toContain("Never say a call ran without approval");

    // What the run says: the approval first, the model's own true line kept, the contradiction gone.
    expect(result.summary).toMatch(/^Approved by course team at \d\d:\d\d UTC, before it ran\./);
    expect(result.summary).toContain("Refund 1HS793997Y972652D is COMPLETED.");
    expect(result.summary).not.toContain("without pausing");
    expect(CLAIMS_NO_APPROVAL.test(result.summary)).toBe(false);
  });

  it("a scripted run states the approval the same way", async () => {
    const { tool } = refundTool();
    approveNext();
    const result = await runScriptedAgent({ runId: "run-s", channel: "test", def: agent(tool) as never, input: { goal: "" }, guard, pauseMs: 0, script: [{ say: "Proposing the refund, then waiting for a person.", tool: "refund_course_purchase", input: { amount: "49.00" }, pauseMs: 0 }] });
    expect(result.summary).toMatch(/^Approved by course team at \d\d:\d\d UTC, before it ran\. Proposing the refund/);
  });

  it("flags the ways a model says there was no approval, and leaves true sentences alone", () => {
    for (const claim of [CONTRADICTION, "It ran with no approval.", "The refund skipped the person's review.", "The guard was bypassed, so no person approved it.", "It wasn't approved by anyone.", "This was an unapproved refund.", "The refund did not wait for a person."]) {
      expect(CLAIMS_NO_APPROVAL.test(claim), claim).toBe(true);
    }
    for (const fine of ["Refund 1HS793997Y972652D is COMPLETED for $49.00.", "Jordan scored 45 and 52, short of the pass mark of 70.", "PayPal notified the learner by email.", "The course team approved the refund, and PayPal paid it."]) {
      expect(CLAIMS_NO_APPROVAL.test(fine), fine).toBe(false);
    }
    expect(withApprovalFact("Done.", [])).toBe("Done.");
    expect(withApprovalFact(CONTRADICTION, [{ decidedBy: "course team", decidedAt: "2026-11-09T19:58:00.000Z" }])).toBe(approvalFact({ decidedBy: "course team", decidedAt: "2026-11-09T19:58:00.000Z" }));
    expect(approvalFact({ decidedBy: "course team", decidedAt: "2026-11-09T19:58:00.000Z" })).toBe("Approved by course team at 19:58 UTC, before it ran.");
  });
});
