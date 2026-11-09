/**
 * Creators' own courses, set up on /creator with no account. Stored like the sample course's data,
 * in a collection on the app's disk. A course's id carries its rubric fingerprint, so its link
 * always grades against that exact rubric: if the stored words ever stopped matching, grading
 * stops rather than use different ones. No payment to creators is built. Server only.
 */
import type { Answers, Rubric } from "@/lib/grading/frozen/score-items";
import { gradeAttempt, type GradeOnce } from "@/lib/grading/grade";
import { HttpError } from "@/lib/http";
import { collection } from "@/lib/store/collection";
import { gradingProblem } from "./attempts";
import { checkRubric, LIMITS } from "./creator-rubric";
import { rubricFingerprint } from "./rubric-lock";
import type { GradedAttempt } from "./types";

export interface CreatorCourse {
  id: string;
  fingerprint: string;
  rubric: Rubric;
  /** What the course teaches, in the creator's words. The grader reads it with the rubric. */
  notes: string;
  createdAt: string;
}

export const creatorCourses = () => collection<CreatorCourse>("creator-courses");

export const creatorCourseId = (fingerprint: string) => `cc_${fingerprint}`;
export const creatorCoursePath = (id: string) => `/c/${id}`;

/** Checks the rubric, stores the course, and returns it. The same rubric always gets the same link. */
export function publishCreatorCourse(input: unknown, notes = ""): CreatorCourse {
  const checked = checkRubric(input);
  if (!checked.ok) throw new HttpError(422, checked.problems.join(" "), "rubric_invalid");
  const cleanNotes = notes.trim().slice(0, LIMITS.notesChars);
  const fingerprint = rubricFingerprint(checked.rubric);
  const id = creatorCourseId(fingerprint);
  const existing = creatorCourses().get(id);
  if (existing) return existing.notes === cleanNotes ? existing : creatorCourses().upsert({ ...existing, notes: cleanNotes });
  return creatorCourses().upsert({ id, fingerprint, rubric: checked.rubric, notes: cleanNotes, createdAt: new Date().toISOString() });
}

/** The course behind a link, only if its stored rubric still has the fingerprint in the link. */
export function creatorCourse(id: string): CreatorCourse {
  const found = creatorCourses().get(id);
  if (!found) throw new HttpError(404, "There's no course at this link. Check the link, or set one up on /creator.", "not_found");
  if (creatorCourseId(rubricFingerprint(found.rubric)) !== id) {
    throw new HttpError(409, "This course's rubric no longer matches its link, so it can't be graded. The creator needs to set it up again.", "rubric_changed");
  }
  return found;
}

/** The course text the grader reads, in the sealed packet's format. */
export function creatorCourseText(course: CreatorCourse): string {
  return [
    `# ${course.rubric.title}`,
    "",
    "## Course content",
    course.notes || "The creator gave no lesson text. Grade against the rubric lines only.",
    "",
    "## Final check",
    ...course.rubric.questions.map((q) => `**${q.id.toUpperCase()}.** ${q.text}`),
  ].join("\n");
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
