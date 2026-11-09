/** When a learner may contest a rubric line, and the words they see. Browser safe. */
import { rubric } from "./content";
import { shortfallItems } from "./policy";
import type { Rubric } from "@/lib/grading/frozen/score-items";
import type { Attempt, Enrollment } from "./types";

export const CONTEST_NOTE_MAX = 500;

/** A rubric line as a learner reads it: the line itself, without the note to the grader after it. */
export const learnerLineText = (itemId: string, from: Rubric = rubric) => {
  const question = from.questions.find((q) => q.items.some((item) => item.id === itemId));
  const text = question?.items.find((item) => item.id === itemId)?.text ?? itemId;
  // Shown on its own, "she" has no one to point to: name the person from the question instead.
  const who = question?.text.split(" ")[0] ?? "";
  return text.split(". ")[0].replace(/\.$/, "").replace(/\bshe\b/g, who || "she");
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
