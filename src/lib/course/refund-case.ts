/**
 * What the refund agent reads beyond the policy: the rubric lines the learner fell short on (the
 * lines, never their answers or quotes), the learner's contest of one line, and whether the frozen
 * rule needed extra grades or a person. Code decides which cases may go to a person for review;
 * the agent only chooses within that. Server only.
 */
import { courseTitleOf, rubricShownFor } from "./creator-store";
import { learnerLineText } from "./contest-rules";
import { formatCents, shortfallItems } from "./policy";
import type { Enrollment } from "./types";

const VERDICT = { partial: "partly met", not_met: "missed" } as const;

export interface RefundCase {
  shortfall: { attempt: number; line: string; verdict: string }[];
  contest: { attempt: number; line: string; learner_wrote: string; ruling: string } | null;
  borderline: string[];
  /** A person already looked and sent it on, so it can't be sent back to them. */
  reviewed_by_person: boolean;
  /** True only for a contested line, or a close grade code decided, that no person has reviewed yet. */
  can_route_to_review: boolean;
}

export function refundCaseFor(enrollment: Enrollment): RefundCase {
  const rubric = rubricShownFor(enrollment);
  const shortfall = enrollment.attempts.flatMap((attempt) =>
    shortfallItems(attempt).map((item) => ({ attempt: attempt.number, line: learnerLineText(item.id, rubric), verdict: VERDICT[item.verdict as keyof typeof VERDICT] ?? item.verdict })),
  );
  const c = enrollment.contest;
  const contest = c
    ? {
        attempt: c.attempt,
        line: learnerLineText(c.itemId, rubric),
        learner_wrote: c.note,
        ruling: c.withdrawnAt ? "withdrawn when the learner took the retake" : !c.ruling ? "not ruled on yet" : c.ruling.upheld ? `upheld: the score went from ${c.ruling.scoreBefore} to ${c.ruling.scoreAfter}` : `not upheld: ${c.ruling.note}`,
      }
    : null;
  const borderline = enrollment.attempts.flatMap((a) => [
    ...(a.runs.length >= 3 ? [`Attempt ${a.number} first scored inside 66-73, so it was graded three times; the middle score, ${a.score}, counts.`] : []),
    ...(a.settled ? [`A person decided attempt ${a.number} (${a.score}) by hand: ${a.settled.outcome === "pass" ? "passed" : "failed"}.`] : []),
  ]);
  const reviewed = enrollment.refund?.review?.decision === "propose";
  // A grade a person already settled by hand has had its look; only a close call code decided goes back.
  const closeCall = enrollment.attempts.some((a) => a.runs.length >= 3 && !a.settled);
  return { shortfall, contest: contest && !c?.withdrawnAt ? contest : null, borderline, reviewed_by_person: reviewed, can_route_to_review: !reviewed && (closeCall || (!!contest && !c?.withdrawnAt)) };
}

/** Lines the learner missed most often across attempts, most first. */
function topMisses(rc: RefundCase, n: number) {
  const counts = new Map<string, number>();
  for (const s of rc.shortfall) counts.set(s.line, (counts.get(s.line) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([line]) => line);
}

/**
 * The notes code writes when no model does: the mock run, and the fallback when the model is out.
 * Built only from the case above.
 */
export function codeNotes(enrollment: Enrollment): { learnerNote: string; teamSummary: string } {
  const rc = refundCaseFor(enrollment);
  const scores = enrollment.attempts.map((a) => a.score).join(" and ");
  const misses = topMisses(rc, 2);
  const amount = formatCents(enrollment.payment?.capturedCents ?? enrollment.priceCents);
  const learnerNote = misses.length
    ? `Sorry ${courseTitleOf(enrollment)} didn't get you there. Your answers fell short most on: ${misses.join("; ")}. Your ${amount} is on its way back through PayPal once the course team approves.`
    : `Sorry ${courseTitleOf(enrollment)} didn't get you there. Your ${amount} is on its way back through PayPal once the course team approves.`;
  const teamSummary = `Two complete fails (${scores}).${misses.length ? ` Fell short most on: ${misses.join("; ")}.` : ""}${rc.contest ? ` The learner contested "${rc.contest.line}" (${rc.contest.ruling}).` : ""}${rc.borderline.length ? ` ${rc.borderline.join(" ")}` : ""} The lesson behind those lines is the one to look at.`;
  return { learnerNote, teamSummary };
}
