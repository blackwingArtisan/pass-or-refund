/**
 * When a refund has waited on the course team longer than the guarantee allows. An approval that
 * runs out stops the refund (nobody decided in time), and a case the agent sent for review waits
 * on the same clock. Either way it stays marked overdue, with the hours, on /team and the public
 * /cohort page until someone acts. Pure, so the screens and tests share it.
 */
import { appConfig } from "@/app.config";
import type { Enrollment } from "./types";

export const DECIDE_WITHIN_MS = appConfig.agentPolicy.approvalTimeoutMs;
const HOUR_MS = 60 * 60 * 1000;

export interface Overdue {
  /** When the time to decide ran out. */
  since: string;
  hours: number;
  /** "overdue, 3 hours" */
  label: string;
}

export function overdueLabel(hours: number) {
  return hours < 1 ? "overdue, under an hour" : `overdue, ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function deadline(enrollment: Pick<Enrollment, "status" | "refund">): number | null {
  const refund = enrollment.refund;
  if (enrollment.status === "refund_blocked" && refund?.overdueSince) return Date.parse(refund.overdueSince);
  if (enrollment.status === "refund_review" && refund?.review && !refund.review.decision) return Date.parse(refund.review.at) + DECIDE_WITHIN_MS;
  return null;
}

/** Reads the clock only for a refund that could be late, so pages without one still prerender. */
export function overdueFor(enrollment: Pick<Enrollment, "status" | "refund">, at?: number): Overdue | null {
  const due = deadline(enrollment);
  if (due === null || Number.isNaN(due)) return null;
  const now = at ?? Date.now();
  if (now < due) return null;
  const hours = Math.floor((now - due) / HOUR_MS);
  return { since: new Date(due).toISOString(), hours, label: overdueLabel(hours) };
}
