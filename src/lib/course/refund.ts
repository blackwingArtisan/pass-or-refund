/**
 * Starts the refund agent once the policy says a refund is due. The agent proposes, the Guard holds
 * the proposal for a person, and the tool moves the money and records it after they approve. The
 * route returns while this waits; the browser polls the enrollment. If the model can't propose,
 * code does, so a due refund still reaches a person. Whatever the run ends with, finish() leaves a
 * state the learner can read.
 */
import { REFUND_AGENT_GOAL, refundAgentFor, refundWithoutAiFor } from "@/agents/refund-agent";
import { getApprovals } from "@/lib/agent/approvals";
import type { AgentDefinition } from "@/lib/agent/define";
import { createAgentRun, runAgentToCompletion, type AgentRun } from "@/lib/agent/runs";
import { HttpError } from "@/lib/http";
import { getPayPal } from "@/lib/paypal";
import { activeRefunds, guaranteeFor, recoverRefund, requireEnrollment, saveEnrollment } from "./enrollments";
import type { Enrollment } from "./types";

const REOPENABLE = ["refund_declined", "refund_blocked"];

function block(id: string, error: string, overdueSince?: string) {
  const enrollment = requireEnrollment(id);
  saveEnrollment({ ...enrollment, status: "refund_blocked", refund: { ...enrollment.refund!, error, ...(overdueSince ? { overdueSince } : {}) } });
}

/** The tool has already recorded a refund that went through, so anything still pending moved no money. */
function finish(id: string, run: AgentRun) {
  const enrollment = requireEnrollment(id);
  if (enrollment.status !== "refund_pending") return;
  const approval = getApprovals().list({ runId: run.id }).at(-1);
  if (approval?.state === "denied") {
    saveEnrollment({ ...enrollment, status: "refund_declined", refund: { ...enrollment.refund!, declinedAt: approval.decidedAt, declinedBy: approval.decidedBy, declineNote: approval.note } });
  } else if (approval?.state === "expired") {
    block(id, "Nobody on the course team decided in time.", approval.expiresAt);
  } else {
    block(id, enrollment.refund?.error ?? run.error ?? "The refund agent stopped without proposing a refund.");
  }
}

/** The run ended and the refund tool was never asked: the model failed or wandered off. A refused ask doesn't count. */
function neverProposed(id: string, run: AgentRun): boolean {
  const { status, refund } = requireEnrollment(id);
  if (status !== "refund_pending" || refund?.error) return false;
  return getApprovals().list({ runId: run.id }).length === 0;
}

const whyNoAi = (run: AgentRun) => (/credit|budget/i.test(run.error ?? "") ? "The AI credit has run out." : run.error ? "The AI model wasn't available." : "The AI agent stopped without proposing a refund.");

/** Proposes without the model. The tools still check every rule, and the Guard still waits for a person. */
function proposeWithoutAi(id: string, failed: AgentRun, channel: string): Promise<AgentRun> {
  const agent = refundWithoutAiFor(requireEnrollment(id));
  const run = createAgentRun(agent, REFUND_AGENT_GOAL, { channel, mode: "scripted" });
  const enrollment = requireEnrollment(id);
  saveEnrollment({ ...enrollment, refund: { ...enrollment.refund!, runId: run.id, proposedWithoutAi: whyNoAi(failed) } });
  return runAgentToCompletion(agent, REFUND_AGENT_GOAL, run);
}

/** Sends a due refund to the agent. No money moves until a person approves at the Guard. */
export function requestRefund(enrollment: Enrollment, channel: string, agent: AgentDefinition = refundAgentFor(enrollment)): { enrollment: Enrollment; finished: Promise<void> } {
  if (activeRefunds().has(enrollment.id)) throw new HttpError(409, "This refund is already waiting for approval.", "conflict");
  if (!guaranteeFor(enrollment).due) throw new HttpError(409, "The guarantee doesn't cover this enrollment.", "conflict");
  if (!enrollment.payment?.captureId) throw new HttpError(409, "This enrollment has no payment to refund.", "conflict");
  const run = createAgentRun(agent, REFUND_AGENT_GOAL, { channel });
  // A person's review stays on the record, so the agent knows it can't send the case back to them.
  const saved = saveEnrollment({ ...enrollment, status: "refund_pending", refund: { runId: run.id, requestedAt: run.startedAt, review: enrollment.refund?.review } });
  activeRefunds().add(enrollment.id);
  const finished = runAgentToCompletion(agent, REFUND_AGENT_GOAL, run)
    .then((done) => (neverProposed(enrollment.id, done) ? proposeWithoutAi(enrollment.id, done, channel) : done))
    .then((done) => finish(enrollment.id, done))
    .catch((e) => block(enrollment.id, e instanceof Error ? e.message : String(e)))
    .finally(() => activeRefunds().delete(enrollment.id));
  return { enrollment: saved, finished };
}

/**
 * The course team asks again after a decline, a timeout or a PayPal error. PayPal is asked first:
 * if a refund was paid and the app stopped before recording it, that refund is recorded, not repeated.
 */
export async function retryRefund(id: string, channel: string): Promise<{ enrollment: Enrollment; finished: Promise<void> }> {
  const enrollment = requireEnrollment(id);
  if (!REOPENABLE.includes(enrollment.status)) throw new HttpError(409, "There's no declined or blocked refund on this enrollment.", "conflict");
  const recovered = await recoverRefund(enrollment, getPayPal());
  if (recovered.status === "refunded") return { enrollment: recovered, finished: Promise.resolve() };
  return requestRefund(enrollment, channel);
}

/**
 * The course team decides a case the refund agent sent to them. "propose" sends it on to the
 * refund agent, which can't route it back, so a refund proposal reaches the approval gate.
 * "decline" ends it with the team's note, and no money moves.
 */
export function decideReview(id: string, decision: "propose" | "decline", note: string, channel: string): { enrollment: Enrollment; finished: Promise<void> } {
  const enrollment = requireEnrollment(id);
  if (enrollment.status !== "refund_review" || !enrollment.refund?.review) throw new HttpError(409, "There's no case waiting for the course team's review here.", "conflict");
  const at = new Date().toISOString();
  const review = { ...enrollment.refund.review, decision, decidedBy: "course team", decidedAt: at, note };
  if (decision === "decline") {
    const declined = saveEnrollment({ ...enrollment, status: "refund_declined", refund: { ...enrollment.refund, review, declinedAt: at, declinedBy: "course team", declineNote: note } });
    return { enrollment: declined, finished: Promise.resolve() };
  }
  return requestRefund(saveEnrollment({ ...enrollment, refund: { ...enrollment.refund, review } }), channel);
}
