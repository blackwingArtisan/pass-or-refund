import { describe, expect, it } from "vitest";
import { creatorCourse, creatorCourses, publishCreatorCourse } from "@/lib/course/creator-courses";
import { formToInput } from "@/lib/course/creator-rubric";
import { EXAMPLE_FORM, EXAMPLE_NOTES, EXAMPLE_PRICE_CENTS, ensureExampleCreatorCourse, exampleCreatorCourseId, restoreIfExample } from "@/lib/course/example-creator-course";
import { rubricFingerprint } from "@/lib/course/rubric-lock";
import { seedAppData } from "@/lib/demo/app-data";

describe("the course a creator made here", () => {
  it("is the creator flow's own output: the same id, rubric, notes and price the form's publish gives", () => {
    creatorCourses().clear();
    const viaForm = publishCreatorCourse(formToInput(EXAMPLE_FORM), EXAMPLE_NOTES, EXAMPLE_PRICE_CENTS);
    creatorCourses().clear();
    const example = ensureExampleCreatorCourse();
    expect(example.id).toBe(viaForm.id);
    expect(example.id).toBe(exampleCreatorCourseId());
    expect(example.id).toBe(`cc_${rubricFingerprint(example.rubric)}`);
    expect({ rubric: example.rubric, notes: example.notes, priceCents: example.priceCents }).toEqual({ rubric: viaForm.rubric, notes: viaForm.notes, priceCents: viaForm.priceCents });
    expect(example.rubric.questions.reduce((sum, q) => sum + q.points, 0)).toBe(100);
    // Its link grades against exactly its rubric.
    expect(creatorCourse(example.id).fingerprint).toBe(example.fingerprint);
  });

  it("is made by the seed, made once, and put back on first use after the disk is wiped", async () => {
    creatorCourses().clear();
    await seedAppData();
    const seeded = creatorCourses().get(exampleCreatorCourseId())!;
    expect(seeded).toBeTruthy();
    expect(ensureExampleCreatorCourse().createdAt).toBe(seeded.createdAt);
    creatorCourses().clear();
    restoreIfExample("cc_000000000000");
    expect(creatorCourses().list()).toHaveLength(0);
    restoreIfExample(exampleCreatorCourseId());
    expect(creatorCourses().get(exampleCreatorCourseId())).toBeTruthy();
  });
});
