import { afterEach, describe, expect, it, vi } from "vitest";
import { refundAgent } from "@/agents/refund-agent";
import { acceptCourseDispute } from "@/agents/tools/accept-course-dispute";
import { NOTE_LIMITS } from "@/agents/tools/note-limits";
import { refundCoursePurchase } from "@/agents/tools/refund-course-purchase";
import { routeRefundToReview } from "@/agents/tools/route-refund-to-review";
import { setMockAgentInput } from "@/lib/ai/mock-agent-input";
import { fitText } from "@/lib/agent/fit-text";
import { submitAttempt } from "@/lib/course/attempts";
import { requireEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { samples } from "@/lib/course/samples";
import { timeline } from "@/lib/events/bus";
import { INPUT_DIDNT_FIT, plainStepError } from "@/lib/events/plain-error";
import { getMockPayPal } from "@/lib/paypal";
import { readyForNextAttempt } from "./course-helpers";

/** About what live Haiku wrote on the hosted take: every rubric line quoted in full, well past 600 characters. */
const LONG_SUMMARY = Array.from({ length: 8 }, (_, i) => `Attempt ${i % 2 ? 2 : 1} fell short on "Says the edge is worn and the knife needs sharpening on a stone, and why a steel alone won't fix it" (line ${i + 1}).`).join(" ");
const WAIT = { timeout: 5_000, interval: 25 };

afterEach(() => setMockAgentInput(null));

describe("shortening prose to its limit", () => {
  it("keeps whole sentences when they hold most of it, else whole words and an ellipsis", () => {
    expect(fitText("Short.", 600)).toBe("Short.");
    const cut = fitText(LONG_SUMMARY, 600);
    expect(cut.length).toBeLessThanOrEqual(600);
    expect(cut).toMatch(/\)\.$/);
    const words = fitText("one two three four five six seven eight nine ten", 20);
    expect(words.length).toBeLessThanOrEqual(20);
    expect(words).toBe("one two three four…");
    // A decimal isn't a sentence end.
    expect(fitText("Refund 49.00 to Jordan now please, because both attempts failed", 30)).toBe("Refund 49.00 to Jordan now…");
  });
});

describe("an over-long note never fails the step, and the hard limits still hold", () => {
  const over = (limit: number) => "x".repeat(limit + 300);

  it("refund_course_purchase: team_summary, learner_note and reasons are shortened to fit", () => {
    const input = refundCoursePurchase("enr_any").parse({
      amount: "49.00",
      reasons: Array.from({ length: 7 }, () => over(NOTE_LIMITS.reasons.each)),
      team_summary: LONG_SUMMARY,
      learner_note: over(NOTE_LIMITS.learner_note),
    });
    expect(LONG_SUMMARY.length).toBeGreaterThan(NOTE_LIMITS.team_summary);
    expect(input.team_summary!.length).toBeLessThanOrEqual(NOTE_LIMITS.team_summary);
    expect(input.learner_note!.length).toBeLessThanOrEqual(NOTE_LIMITS.learner_note);
    expect(input.learner_note).toMatch(/…$/);
    expect(input.reasons).toHaveLength(NOTE_LIMITS.reasons.items);
    for (const r of input.reasons) expect(r.length).toBeLessThanOrEqual(NOTE_LIMITS.reasons.each);
    expect(input.amount).toBe("49.00");
  });

  it("route_refund_to_review: reason, team_summary and learner_note are shortened to fit", () => {
    const input = routeRefundToReview("enr_any").parse({ reason: over(NOTE_LIMITS.reason), team_summary: LONG_SUMMARY, learner_note: over(NOTE_LIMITS.learner_note) });
    expect(input.reason.length).toBeLessThanOrEqual(NOTE_LIMITS.reason);
    expect(input.team_summary.length).toBeLessThanOrEqual(NOTE_LIMITS.team_summary);
    expect(input.learner_note.length).toBeLessThanOrEqual(NOTE_LIMITS.learner_note);
  });

  it("accept_dispute_claim: reasons are shortened to fit", () => {
    const input = acceptCourseDispute("enr_any").parse({ reasons: [over(NOTE_LIMITS.reasons.each)] });
    expect(input.reasons[0].length).toBeLessThanOrEqual(NOTE_LIMITS.reasons.each);
  });

  it("ids and amounts are never shortened: a bad amount still fails, and the schema still states each limit", () => {
    const tool = refundCoursePurchase("enr_any");
    expect(() => tool.parse({ amount: "", reasons: ["Due."] })).toThrow();
    expect(() => tool.parse({ amount: "49.00", reasons: [] })).toThrow();
    const props = (tool.inputSchema as { properties: Record<string, { maxLength?: number }> }).properties;
    expect(props.team_summary.maxLength).toBe(600);
    expect(props.learner_note.maxLength).toBe(500);
  });

  it("the agent is told each field's real limit, in characters", () => {
    const { system } = refundAgent("enr_any");
    expect(system).toContain(`limit ${NOTE_LIMITS.team_summary}`);
    expect(system).toContain(`limit ${NOTE_LIMITS.learner_note}`);
    expect(system).toContain(`limit ${NOTE_LIMITS.reasons.each}`);
    expect(system).toContain(`limit ${NOTE_LIMITS.reason}`);
  });
});

describe("a refund agent that overruns every limit, as live Haiku did", () => {
  it("still reaches a person with the agent's own proposal, with no failed step on the timeline", async () => {
    const from = new Date().toISOString();
    const { enrollment, orderId } = await startPurchase("Len Long", "len-long@example.com");
    getMockPayPal()!.simulateBuyerApproval(orderId, { email: "paypal.len-long@example.com" });
    const { id } = await completePurchase(enrollment.id, orderId, "test");
    await submitAttempt(id, samples.fail1, "test");
    readyForNextAttempt(id);
    setMockAgentInput("long-notes");
    await submitAttempt(id, samples.fail2, "test");
    const approval = await vi.waitFor(() => {
      const a = viewEnrollment(requireEnrollment(id)).approval;
      if (!a) throw new Error("No approval yet");
      return a;
    }, WAIT);
    expect(approval).toBeTruthy();
    // The agent's proposal, not code's fallback after a failed one.
    expect(requireEnrollment(id).refund!.proposedWithoutAi).toBeUndefined();
    const proposal = requireEnrollment(id).refund!.proposal!;
    expect(proposal.teamSummary!.length).toBeGreaterThan(NOTE_LIMITS.team_summary * 0.6);
    expect(proposal.teamSummary!.length).toBeLessThanOrEqual(NOTE_LIMITS.team_summary);
    expect(proposal.learnerNote!.length).toBeLessThanOrEqual(NOTE_LIMITS.learner_note);
    const failed = timeline.history().filter((e) => e.ts >= from && e.kind === "tool" && e.status === "failed");
    expect(failed).toEqual([]);
  });
});

describe("the line a failed step shows", () => {
  it("is plain words, never a ZodError's JSON", () => {
    const zod = { name: "ZodError", message: '[\n  {\n    "origin": "string",\n    "code": "too_big",\n    "maximum": 600,\n    "path": ["team_summary"]\n  }\n]' };
    expect(plainStepError(zod)).toBe(INPUT_DIDNT_FIT);
    expect(plainStepError({ name: "Error", message: '{"error":"INVALID_INPUT"}' })).toBe(INPUT_DIDNT_FIT);
    expect(plainStepError({ name: "HttpError", message: "This case is with the course team for review, so wait for their decision." })).toBe("This case is with the course team for review, so wait for their decision.");
    expect(plainStepError({ name: "PayPalError", message: "The capture was already refunded. [CAPTURE_FULLY_REFUNDED]" })).toBe("The capture was already refunded.");
    expect(plainStepError(undefined)).toBe("This step didn't go through.");
  });
});
