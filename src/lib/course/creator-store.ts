/**
 * Creators' own courses, as stored: a collection on the app's disk, like the sample course's data.
 * A course's id carries its rubric fingerprint. Server only.
 */
import type { Rubric } from "@/lib/grading/frozen/score-items";
import { HttpError } from "@/lib/http";
import { collection } from "@/lib/store/collection";
import { course as sampleCourse, rubric as sampleRubric } from "./content";
import { rubricFingerprint } from "./rubric-lock";

export interface CreatorCourse {
  id: string;
  fingerprint: string;
  rubric: Rubric;
  /** What the course teaches, in the creator's words. The grader reads it with the rubric. */
  notes: string;
  /** What a learner pays, set by the creator. Courses set up before prices existed sell at $49. */
  priceCents?: number;
  createdAt: string;
}

export const CREATOR_DEFAULT_PRICE_CENTS = 4900;
export const creatorCourses = () => collection<CreatorCourse>("creator-courses");
export const creatorCourseId = (fingerprint: string) => `cc_${fingerprint}`;
export const creatorCoursePath = (id: string) => `/c/${id}`;
export const isCreatorCourseId = (id: string | undefined): id is string => Boolean(id?.startsWith("cc_"));
export const creatorPriceCents = (course: CreatorCourse) => course.priceCents ?? CREATOR_DEFAULT_PRICE_CENTS;

/** The course behind a link, only if its stored rubric still has the fingerprint in the link. */
export function creatorCourse(id: string): CreatorCourse {
  const found = creatorCourses().get(id);
  if (!found) throw new HttpError(404, "There's no course at this link. Check the link, or set one up on /creator.", "not_found");
  if (creatorCourseId(rubricFingerprint(found.rubric)) !== id) {
    throw new HttpError(409, "This course's rubric no longer matches its link, so it can't be graded. The creator needs to set it up again.", "rubric_changed");
  }
  return found;
}

/** The creator rubric a learner bought: the one whose fingerprint their purchase locked. Grading stops rather than use different words. */
export function boughtCreatorRubric(courseId: string, lockedFingerprint: string | undefined): Rubric {
  const course = creatorCourse(courseId);
  if (rubricFingerprint(course.rubric) !== lockedFingerprint) {
    throw new HttpError(409, "The rubric you bought no longer matches what's on file, so grading stopped and nothing was counted. The course team has been told.", "rubric_changed");
  }
  return course.rubric;
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

/** The title of the course an enrollment is for: a creator's, or the sample course's. */
export function courseTitleOf(enrollment: { courseId?: string }): string {
  return (enrollment.courseId && creatorCourses().get(enrollment.courseId)?.rubric.title) || sampleCourse.title;
}

/** The rubric an enrollment's screens and notes read lines from (grading itself checks the locked fingerprint). */
export function rubricShownFor(enrollment: { courseId?: string }): Rubric {
  return (enrollment.courseId && creatorCourses().get(enrollment.courseId)?.rubric) || sampleRubric;
}
