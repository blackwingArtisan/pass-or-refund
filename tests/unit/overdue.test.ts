import { describe, expect, it } from "vitest";
import { DECIDE_WITHIN_MS, overdueFor, overdueLabel } from "@/lib/course/overdue";
import { GUARANTEE_TERMS } from "@/lib/course/policy";
import type { Enrollment } from "@/lib/course/types";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-11-08T20:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();
const refund = { runId: "r", requestedAt: ago(10) };
const review = (at: string, decision?: "propose" | "decline") => ({ reason: "x", teamSummary: "x", learnerNote: "x", at, ...(decision ? { decision } : {}) });

describe("a refund the course team left too long", () => {
  it("reads in whole hours", () => {
    expect(overdueLabel(0)).toBe("overdue, under an hour");
    expect(overdueLabel(1)).toBe("overdue, 1 hour");
    expect(overdueLabel(5)).toBe("overdue, 5 hours");
  });

  it("counts from when the approval ran out, until someone acts", () => {
    const blocked = { status: "refund_blocked", refund: { ...refund, overdueSince: ago(3.5) } } as Pick<Enrollment, "status" | "refund">;
    expect(overdueFor(blocked, NOW)).toEqual({ since: ago(3.5), hours: 3, label: "overdue, 3 hours" });
    // A refund blocked for another reason (a PayPal error) isn't the team being late.
    expect(overdueFor({ status: "refund_blocked", refund }, NOW)).toBeNull();
    // Asking again clears it: the refund is pending, with a fresh approval clock.
    expect(overdueFor({ status: "refund_pending", refund: { ...refund, overdueSince: ago(3.5) } }, NOW)).toBeNull();
  });

  it("gives a case sent for review the same hour", () => {
    expect(overdueFor({ status: "refund_review", refund: { ...refund, review: review(ago(0.5)) } }, NOW)).toBeNull();
    expect(overdueFor({ status: "refund_review", refund: { ...refund, review: review(ago(2.5)) } }, NOW)?.label).toBe("overdue, 1 hour");
    expect(overdueFor({ status: "refund_review", refund: { ...refund, review: review(ago(2.5), "propose") } }, NOW)).toBeNull();
  });

  it("is the hour the guarantee promises", () => {
    expect(DECIDE_WITHIN_MS).toBe(HOUR);
    expect(GUARANTEE_TERMS.join(" ")).toMatch(/within an hour, your refund is marked overdue/);
    expect(GUARANTEE_TERMS.join(" ")).toMatch(/If the course team declines, they have to say why/);
  });
});
