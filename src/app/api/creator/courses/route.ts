import { z } from "zod";
import { creatorCoursePath, publishCreatorCourse } from "@/lib/course/creator-courses";
import { checkRubric, LIMITS, parsePasted } from "@/lib/course/creator-rubric";
import { readJson, route } from "@/lib/http";

/** Either the simple form's rubric (an object) or pasted JSON text. */
const Body = z.object({
  rubric: z.unknown().optional(),
  pasted: z.string().max(40_000).optional(),
  notes: z.string().max(LIMITS.notesChars).optional(),
});

/** Sets up a creator's course from their rubric: no account, no payment. Returns its fingerprint and link. */
export const POST = route(async (req) => {
  const { rubric, pasted, notes } = await readJson(req, Body);
  const checked = pasted !== undefined ? parsePasted(pasted) : checkRubric(rubric);
  if (!checked.ok) {
    return Response.json({ error: { type: "rubric_invalid", message: checked.problems[0], problems: checked.problems } }, { status: 422 });
  }
  const course = publishCreatorCourse(checked.rubric, notes);
  return { id: course.id, fingerprint: course.fingerprint, path: creatorCoursePath(course.id), title: course.rubric.title };
});
