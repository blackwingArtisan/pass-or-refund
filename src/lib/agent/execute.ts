/**
 * Runs one tool call for an agent (Claude or scripted): validate -> guard -> timeline card ->
 * a tool_result string the model can read.
 */
import { startStep } from "../events/bus";
import type { MoneyDirection, ToolSource } from "../events/types";
import type { Approval } from "./approvals";
import type { Guard, GuardOutcome } from "./guard";
import type { AgentTool } from "./tool";

export const SOURCE_LABEL: Record<ToolSource, string> = {
  "paypal-agent-toolkit": "PayPal Agent Toolkit",
  "kit-extension": "Toolkit-style extension",
  app: "App tool",
};

export interface ToolCallResult {
  content: string;
  isError: boolean;
  outcome?: GuardOutcome;
  output?: unknown;
}

const MAX_RESULT_CHARS = 8000;

function forModel(value: unknown): string {
  const json = JSON.stringify(value, (k, v) => (k === "links" ? undefined : v));
  if (!json) return "OK";
  return json.length > MAX_RESULT_CHARS ? `${json.slice(0, MAX_RESULT_CHARS)}…[truncated]` : json;
}

/** The approval a person gave, as code states it: "Approved by the course team at 19:58 UTC, before it ran." */
export function approvalFact(approval: Pick<Approval, "decidedBy" | "decidedAt">): string {
  const at = approval.decidedAt ? ` at ${approval.decidedAt.slice(11, 16)} UTC` : "";
  return `Approved by ${approval.decidedBy ?? "a person"}${at}, before it ran.`;
}

/**
 * A sentence that says a tool ran without a person's approval, or skipped or bypassed one. After a
 * person approved the call, any such sentence is false, so code drops it.
 */
export const CLAIMS_NO_APPROVAL = /\b(without|no|never|not|skip\w*|bypass\w*|before any)\b[^.!?]{0,60}\b(approv\w*|paus\w*|person|human|review\w*)|\bunapproved\b|\b(didn'?t|did not|wasn'?t|was not|isn'?t)\b[^.!?]{0,40}\b(approv\w*|paus\w*|wait\w*)/i;

/**
 * What the agent says once a person has approved one of its calls: code's own sentence first, then
 * the model's words, less any sentence that claims there was no approval.
 */
export function withApprovalFact(text: string, approved: Pick<Approval, "decidedBy" | "decidedAt">[]): string {
  if (!approved.length) return text;
  // Sentences end at a stop followed by a space, so "49.00" stays whole.
  const kept = text.split(/(?<=[.!?])\s+/).filter((sentence) => !CLAIMS_NO_APPROVAL.test(sentence)).join(" ").trim();
  const fact = approvalFact(approved.at(-1)!);
  return kept ? `${fact} ${kept}` : fact;
}

function humanize(name: string) {
  return name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function directionFor(tool: AgentTool): MoneyDirection | undefined {
  if (tool.risk === "read") return undefined;
  if (/void/.test(tool.name)) return "neutral";
  if (/refund|payout|accept_dispute/.test(tool.name)) return "out";
  if (/authoriz/.test(tool.name) && !/capture/.test(tool.name)) return "hold";
  if (/capture|pay_order|charge/.test(tool.name)) return "in";
  return "neutral";
}

export async function runTool(tool: AgentTool, rawInput: unknown, ctx: { runId: string; actor: string; channel: string; guard: Guard }): Promise<ToolCallResult> {
  let input: unknown;
  let title = humanize(tool.name);
  try {
    input = tool.parse(rawInput);
    title = tool.title?.(input as never) ?? title;
  } catch (error) {
    const step = startStep({ kind: "tool", title, subtitle: `${SOURCE_LABEL[tool.source]} · ${tool.name}`, tool: { name: tool.name, source: tool.source, input: rawInput } });
    // The timeline shows a plain line with the raw error under Details (tool-call-timeline.tsx); the model gets it all.
    step.fail(error);
    return { content: JSON.stringify({ error: "INVALID_INPUT", message: error instanceof Error ? error.message : String(error) }), isError: true };
  }

  const step = startStep({
    kind: "tool",
    title,
    subtitle: `${SOURCE_LABEL[tool.source]} · ${tool.name}`,
    direction: directionFor(tool),
    tool: { name: tool.name, source: tool.source, input },
    data: tool.risk === "read" ? { quiet: true, risk: tool.risk } : { risk: tool.risk },
  });

  const outcome = await ctx.guard.run(tool, input as never, {
    runId: ctx.runId,
    actor: ctx.actor,
    channel: ctx.channel,
    onImpact: (impact) => step.update({ title: impact.summary, amount: impact.amount }),
    onApprovalRequested: (a) => step.update({ status: "awaiting_approval", detail: a.reason, approval: { id: a.id, state: "pending", reason: a.reason } }),
    onApprovalDecided: (a) =>
      step.update({
        status: a.state === "approved" ? "running" : "denied",
        detail: a.state === "approved" ? `Approved by ${a.decidedBy}` : a.state === "expired" ? "Approval expired" : `Declined by ${a.decidedBy}`,
        approval: { id: a.id, state: a.state, reason: a.reason, decidedBy: a.decidedBy },
      }),
  });

  if (outcome.status === "executed") {
    step.succeed({
      detail: outcome.replayed ? "Replayed stored result (idempotent)" : undefined,
      tool: { name: tool.name, source: tool.source, input, output: outcome.result },
    });
    // A call a person approved says so in the result the model reads: who, when, and that it waited for them.
    const content = outcome.approval?.state === "approved" ? forModel({ person_approval: { state: "approved", approval_id: outcome.approval.id, by: outcome.approval.decidedBy, at: outcome.approval.decidedAt, fact: approvalFact(outcome.approval) }, result: outcome.result }) : forModel(outcome.result);
    return { content, isError: false, outcome, output: outcome.result };
  }
  if (outcome.status === "denied") {
    step.update({ status: "denied", detail: outcome.reason, error: { name: outcome.code, message: outcome.reason } });
    return {
      content: JSON.stringify({
        error: "DENIED_BY_GUARD",
        code: outcome.code,
        reason: outcome.reason,
        guidance: "Do not retry this exact call. Tell the user what was blocked and why, or propose a smaller/allowed alternative.",
      }),
      isError: true,
      outcome,
    };
  }
  step.fail(outcome.error);
  const e = outcome.error as { name?: string; message?: string; issue?: string; debugId?: string; status?: number };
  return {
    content: JSON.stringify({ error: e.name ?? "TOOL_FAILED", message: e.message ?? String(outcome.error), issue: e.issue, debug_id: e.debugId, http_status: e.status }),
    isError: true,
    outcome,
  };
}
