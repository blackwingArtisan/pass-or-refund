import { z } from "zod";
import { creatorCoursePath, creatorPriceCents, publishCreatorCourse } from "@/lib/course/creator-courses";
import { checkPrice, checkRubric, LIMITS, parsePasted } from "@/lib/course/creator-rubric";
import { readJson, route } from "@/lib/http";

/** Either the simple form's rubric (an object) or pasted JSON text. */
const Body = z.object({
  rubric: z.unknown().optional(),
  pasted: z.string().max(40_000).optional(),
  notes: z.string().max(LIMITS.notesChars).optional(),
  /** Whole dollars; $49 when left out. */
  price: z.union([z.string().max(12), z.number()]).optional(),
});

/** Sets up a creator's course from their rubric and price: no account. Returns its fingerprint and link. */
export const POST = route(async (req) => {
  const { rubric, pasted, notes, price } = await readJson(req, Body);
  const checked = pasted !== undefined ? parsePasted(pasted) : checkRubric(rubric);
  const priced = checkPrice(price);
  const problems = [...(checked.ok ? [] : checked.problems), ...(priced.ok ? [] : [priced.problem])];
  if (!checked.ok || !priced.ok) {
    return Response.json({ error: { type: "rubric_invalid", message: problems[0], problems } }, { status: 422 });
  }
  const course = publishCreatorCourse(checked.rubric, notes, priced.cents);
  return { id: course.id, fingerprint: course.fingerprint, path: creatorCoursePath(course.id), title: course.rubric.title, priceCents: creatorPriceCents(course) };
});
