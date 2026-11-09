/**
 * One course made through /creator, so a visitor can see what a creator's course looks like
 * without setting one up. The app's team wrote it on the creator form; it goes through the same
 * publish step the form's "Publish" button calls (rubric check, fingerprint, cc_<fingerprint> link)
 * and sells through the same PayPal checkout. Made on first use and by the seed, because the
 * hosted app's disk starts empty on each deploy. Server only.
 */
import { creatorCourseId, creatorCourses, publishCreatorCourse, type CreatorCourse } from "./creator-courses";
import { checkRubric, formToInput, type RubricForm } from "./creator-rubric";
import { rubricFingerprint } from "./rubric-lock";

/** What the team typed into the creator form, line for line. */
export const EXAMPLE_FORM: RubricForm = {
  title: "Pour-over coffee that isn't sour",
  passMark: 70,
  questions: [
    {
      text: "Your pour-over tastes sour and thin. What do you change first, and why?",
      lines: ["20 Says sour and thin usually means the coffee is under-extracted", "20 Says to grind finer so the water takes more from the coffee", "10 Says to change one thing at a time and taste again"].join("\n"),
    },
    {
      text: "Why rinse the paper filter with hot water before you brew?",
      lines: ["20 Says rinsing takes away the papery taste", "15 Says it warms the brewer and the cup", "15 Says to pour the rinse water away before brewing"].join("\n"),
    },
  ],
};

export const EXAMPLE_NOTES = [
  "Lesson 1. Sour and thin. A sour, thin cup is usually under-extracted: the water didn't take enough from the coffee. Grind finer first, so the water meets more surface. Change one thing at a time, then taste again.",
  "Lesson 2. The filter. Rinse the paper filter with hot water before brewing. It takes away the papery taste and warms the brewer and the cup. Pour that rinse water away before you start.",
].join("\n\n");

export const EXAMPLE_PRICE_CENTS = 1900;

const rubric = () => {
  const checked = checkRubric(formToInput(EXAMPLE_FORM));
  if (!checked.ok) throw new Error(`The example creator course's rubric is invalid: ${checked.problems.join(" ")}`);
  return checked.rubric;
};

/** The example course's link id, cc_<fingerprint>: fixed by its rubric, the same on every deploy. */
export const exampleCreatorCourseId = () => creatorCourseId(rubricFingerprint(rubric()));

/** The example course, published through the creator flow if it isn't on disk yet. */
export function ensureExampleCreatorCourse(): CreatorCourse {
  return creatorCourses().get(exampleCreatorCourseId()) ?? publishCreatorCourse(formToInput(EXAMPLE_FORM), EXAMPLE_NOTES, EXAMPLE_PRICE_CENTS);
}

/** Before a creator-course route reads `id`: puts the example course back if a fresh disk lost it. */
export function restoreIfExample(id: string | undefined): void {
  if (id === exampleCreatorCourseId()) ensureExampleCreatorCourse();
}
