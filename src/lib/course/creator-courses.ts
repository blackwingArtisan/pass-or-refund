/**
 * Creators' own courses, set up on /creator with no account. Stored like the sample course's data,
 * in a collection on the app's disk. A course's id carries its rubric fingerprint, so its link
 * always grades against that exact rubric: if the stored words ever stopped matching, grading
 * stops rather than use different ones. Learners buy a creator's course at the creator's price
 * through the same PayPal checkout as the sample course; paying creators out isn't built. Server only.
 */
import type { Answers } from "@/lib/grading/frozen/score-items";
import { gradeAttempt, type GradeOnce } from "@/lib/grading/grade";
import { HttpError } from "@/lib/http";
import { CREATOR_DEFAULT_PRICE_CENTS, creatorCourse, creatorCourseId, creatorCourses, creatorCourseText, type CreatorCourse } from "./creator-store";
import { gradingProblem } from "./attempts";
import { checkRubric, LIMITS } from "./creator-rubric";
import { rubricFingerprint } from "./rubric-lock";
import type { GradedAttempt } from "./types";

export { creatorCourse, creatorCourseId, creatorCoursePath, creatorCourses, creatorCourseText, creatorPriceCents, type CreatorCourse } from "./creator-store";

/** Checks the rubric, stores the course, and returns it. The same rubric always gets the same link; notes and price can change. */
export function publishCreatorCourse(input: unknown, notes = "", priceCents = CREATOR_DEFAULT_PRICE_CENTS): CreatorCourse {
  const checked = checkRubric(input);
  if (!checked.ok) throw new HttpError(422, checked.problems.join(" "), "rubric_invalid");
  const cleanNotes = notes.trim().slice(0, LIMITS.notesChars);
  const fingerprint = rubricFingerprint(checked.rubric);
  const id = creatorCourseId(fingerprint);
  const existing = creatorCourses().get(id);
  if (existing) return existing.notes === cleanNotes && existing.priceCents === priceCents ? existing : creatorCourses().upsert({ ...existing, notes: cleanNotes, priceCents });
  return creatorCourses().upsert({ id, fingerprint, rubric: checked.rubric, notes: cleanNotes, priceCents, createdAt: new Date().toISOString() });
}

/** A practice attempt on a creator's course: the same sealed grader and the same arithmetic, nothing stored. */
export async function gradeCreatorAttempt(id: string, input: Record<string, string>, grade?: GradeOnce): Promise<GradedAttempt & { fingerprint: string }> {
  const course = creatorCourse(id);
  const answers: Answers = Object.fromEntries(course.rubric.questions.map((q) => [q.id, (input[q.id] ?? "").trim()]));
  if (Object.values(answers).every((a) => a === "")) throw new HttpError(422, "Answer at least one question first.", "rule");
  const graded = await gradeAttempt(answers, `${course.rubric.title} practice`, grade, course.rubric, creatorCourseText(course)).catch((error) => {
    throw gradingProblem(error);
  });
  return { ...graded, fingerprint: course.fingerprint };
}
