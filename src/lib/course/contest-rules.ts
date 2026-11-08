/** When a learner may contest a rubric line, and the words they see. Browser safe. */
import { rubric } from "./content";
import { shortfallItems } from "./policy";
import type { Attempt, Enrollment } from "./types";

export const CONTEST_NOTE_MAX = 500;

/** A rubric line as a learner reads it: the line itself, without the note to the grader after it. */
export const learnerLineText = (itemId: string) => {
  const text = rubric.questions.flatMap((q) => q.items).find((item) => item.id === itemId)?.text ?? itemId;
  return text.split(". ")[0].replace(/\.$/, "");
};

/**
 * One contest per purchase, on the first attempt, before the retake. A flagged attempt (one that
 * tried to instruct the grader) can't be contested.
 */
export function contestableAttempt(enrollment: Pick<Enrollment, "status" | "attempts" | "contest">): Attempt | null {
  const latest = enrollment.attempts.at(-1);
  if (enrollment.contest || enrollment.status !== "active" || !latest || latest.number !== 1 || latest.outcome !== "fail" || latest.flagged) return null;
  return shortfallItems(latest).length > 0 ? latest : null;
}
