import { creatorCourse } from "@/lib/course/creator-courses";
import { rubricText } from "@/lib/course/rubric-lock";
import { route } from "@/lib/http";

/** A creator's course: its rubric, the fingerprint in its link, and the exact text that fingerprint is taken from. */
export const GET = route<RouteContext<"/api/creator/courses/[id]">>(async (_req, { params }) => {
  const course = creatorCourse((await params).id);
  return { id: course.id, fingerprint: course.fingerprint, rubric: course.rubric, rubricText: rubricText(course.rubric), notes: course.notes, createdAt: course.createdAt };
});
