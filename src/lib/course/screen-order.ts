/**
 * What the course team and the learner see first. Pure, so both screens and the unit tests share it.
 */
import type { ScoredItem } from "@/lib/grading/frozen/score-items";
import type { EnrollmentView } from "./types";

/** Something only a person can do: approve or decline a refund, settle a 69-70, rule on a contest, answer a dispute. */
export function waitsForTeam(e: EnrollmentView): boolean {
  const openContest = Boolean(e.contest && !e.contest.ruling && !e.contest.withdrawnAt);
  const openDispute = Boolean(e.dispute && e.dispute.status !== "RESOLVED");
  return Boolean(e.approval) || openContest || openDispute || ["refund_pending", "refund_review", "under_review", "refund_blocked"].includes(e.status);
}

/**
 * The quote that decided a question: from the line that lost the most points, else the first
 * quote. The other quotes and the learner's answer wait behind an expander.
 */
export function decidingItemId(items: ScoredItem[], maxPoints: Record<string, number>): string | undefined {
  const quoted = items.filter((item) => item.quote);
  const lost = (item: ScoredItem) => (maxPoints[item.id] ?? 0) - item.points;
  const worst = quoted.reduce<ScoredItem | undefined>((best, item) => (lost(item) > 0 && (!best || lost(item) > lost(best)) ? item : best), undefined);
  return (worst ?? quoted[0])?.id;
}
