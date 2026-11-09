import { describe, expect, it } from "vitest";
import { rubric as sample } from "@/lib/course/content";
import { creatorCourse, creatorCourses, gradeCreatorAttempt, publishCreatorCourse } from "@/lib/course/creator-courses";
import { checkPrice, checkRubric, formToInput, parseLine, parsePasted } from "@/lib/course/creator-rubric";
import { boughtCreatorRubric } from "@/lib/course/creator-store";
import { createEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { attemptComplete } from "@/lib/course/policy";
import { rubricFingerprint, rubricOnSale, rubricText } from "@/lib/course/rubric-lock";
import type { GradeOnce } from "@/lib/grading/grade";

const bread = {
  title: "Bread at Home",
  passMark: 70,
  questions: [
    { text: "How do you know the dough has proved enough?", items: [{ points: 30, text: "Says it has doubled in size" }, { points: 20, text: "Says a poked dent springs back slowly" }] },
    { text: "Why let the loaf cool before slicing?", items: [{ points: 50, text: "Says the crumb is still setting from steam inside" }] },
  ],
};

const problemsOf = (input: unknown) => {
  const checked = checkRubric(input);
  return checked.ok ? [] : checked.problems;
};

describe("a creator's rubric, checked in plain words", () => {
  it("accepts a rubric whose points add up to 100, with ids set by position", () => {
    const checked = checkRubric(bread);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.rubric).toMatchObject({ course: "bread-at-home", title: "Bread at Home", passMark: 70 });
    expect(checked.rubric.questions.map((q) => [q.id, q.points, q.items.map((i) => i.id)])).toEqual([
      ["q1", 50, ["q1a", "q1b"]],
      ["q2", 50, ["q2a"]],
    ]);
  });

  it("says what to fix, in words a creator can act on", () => {
    expect(problemsOf({ ...bread, title: " " })).toContain("Give the course a title.");
    expect(problemsOf({ ...bread, passMark: 101 })).toContain("The pass mark has to be a whole number from 1 to 100.");
    expect(problemsOf({ ...bread, questions: [] })).toContain("Add at least one question.");
    expect(problemsOf({ ...bread, questions: [bread.questions[0]] })).toContain("The points add up to 50. They have to add up to 100, so the pass mark reads as a percentage.");
    expect(problemsOf({ ...bread, questions: [{ text: "", items: [] }, bread.questions[1]] })).toEqual(
      expect.arrayContaining(["Question 1 needs its wording, what the learner is asked.", "Question 1 needs at least one rubric line: something a good answer says, with its points."]),
    );
    expect(problemsOf({ ...bread, questions: [{ ...bread.questions[0], items: [{ points: "lots", text: "Says it doubled" }] }, bread.questions[1]] })).toContain(
      'Question 1, line 1 needs a whole number of points above 0, written first, like "7 Says ...".',
    );
    const notJson = parsePasted("{ title: Bread }");
    expect(notJson.ok).toBe(false);
    if (!notJson.ok) expect(notJson.problems[0]).toMatch(/^That isn't valid JSON, so nothing was read\./);
  });

  it("reads the simple form's lines with the points first", () => {
    expect(parseLine("30 Says it has doubled in size")).toEqual({ points: 30, text: "Says it has doubled in size" });
    expect(parseLine("20: Says a dent springs back")).toEqual({ points: 20, text: "Says a dent springs back" });
    expect(parseLine("Says nothing about points")).toEqual({ points: null, text: "Says nothing about points" });
    const input = formToInput({ title: "Bread at Home", passMark: "70", questions: [{ text: "Q?", lines: "60 Says one\n\n40 | Says two" }] });
    const checked = checkRubric(input);
    expect(checked.ok && checked.rubric.questions[0].items).toEqual([
      { id: "q1a", points: 60, text: "Says one" },
      { id: "q1b", points: 40, text: "Says two" },
    ]);
  });

  it("pasting the public sample rubric gives the sample course's own fingerprint", () => {
    const pasted = parsePasted(rubricText(sample));
    expect(pasted.ok).toBe(true);
    if (pasted.ok) expect(rubricFingerprint(pasted.rubric)).toBe(rubricOnSale().fingerprint);
  });
});

describe("a creator's course at its link", () => {
  it("gets a fingerprint and a link, and the same rubric always gets the same link", () => {
    const course = publishCreatorCourse(bread);
    expect(course.id).toBe(`cc_${course.fingerprint}`);
    expect(course.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(publishCreatorCourse(structuredClone(bread)).id).toBe(course.id);
    expect(creatorCourse(course.id).rubric.title).toBe("Bread at Home");
  });

  it("changes fingerprint when one word of the rubric changes, and the old link keeps the old rubric", () => {
    const before = publishCreatorCourse(bread);
    const edited = structuredClone(bread);
    edited.questions[0].items[0].text = "Says it has nearly doubled in size";
    const after = publishCreatorCourse(edited);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(after.id).not.toBe(before.id);
    expect(creatorCourse(before.id).rubric.questions[0].items[0].text).toBe("Says it has doubled in size");
    expect(creatorCourse(after.id).rubric.questions[0].items[0].text).toBe("Says it has nearly doubled in size");
  });

  it("refuses to grade if the stored words stop matching the fingerprint in the link", () => {
    const course = publishCreatorCourse({ ...bread, title: "Bread at Home, tampered" });
    const changed = structuredClone(course);
    changed.rubric.questions[1].items[0].text = "Says anything at all";
    creatorCourses().upsert(changed);
    expect(() => creatorCourse(course.id)).toThrow(/no longer matches its link/);
    expect(() => creatorCourse("cc_000000000000")).toThrow(/no course at this link/);
  });

  it("grades a practice attempt against that exact rubric, with the creator's notes as the course text", async () => {
    const course = publishCreatorCourse({ ...bread, title: "Bread at Home, graded" }, "Prove the dough until doubled. Cool the loaf an hour.");
    const seen: { ids: string[]; course?: string }[] = [];
    const grade: GradeOnce = async (answers, _run, _label, rubric, text) => {
      seen.push({ ids: rubric!.questions.flatMap((q) => q.items.map((i) => i.id)), course: text });
      const met = rubric!.questions.flatMap((q) => q.items.map((i) => ({ id: i.id, points: i.points, verdict: "met" as const, quote: answers[q.id], quoteFound: true })));
      return { total: 100, totalQuoteChecked: 100, perQuestion: {}, items: met, caps: [], injectionAttempted: false, injectionQuote: "", mocked: true, costUsd: 0 };
    };
    const graded = await gradeCreatorAttempt(course.id, { q1: "It doubled and the dent springs back", q2: "The crumb is still setting" }, grade);
    expect(graded).toMatchObject({ outcome: "pass", score: 100, fingerprint: course.fingerprint });
    expect(seen[0].ids).toEqual(["q1a", "q1b", "q2a"]);
    expect(seen[0].course).toContain("Prove the dough until doubled.");
    await expect(gradeCreatorAttempt(course.id, { q1: " ", q2: "" }, grade)).rejects.toThrow("Answer at least one question first.");
  });

  it("grades with the mock grader on a creator's own rubric lines", async () => {
    const course = publishCreatorCourse({ ...bread, title: "Bread at Home, mock" });
    const graded = await gradeCreatorAttempt(course.id, { q1: "It doubled in size. A dent springs back", q2: "Steam is still inside" });
    const run = graded.runs[graded.shownRun];
    expect(run.items.map((i) => i.id)).toEqual(["q1a", "q1b", "q2a"]);
    expect(run.items.every((i) => i.quote.length > 0)).toBe(true);
    expect(graded.outcome).toBe("fail");
  });
});

describe("buying a creator's course", () => {
  it("prices it in whole dollars from $1 to $49, with $49 when left out", () => {
    expect(checkPrice("29")).toEqual({ ok: true, cents: 2900 });
    expect(checkPrice("$5")).toEqual({ ok: true, cents: 500 });
    expect(checkPrice(undefined)).toEqual({ ok: true, cents: 4900 });
    for (const bad of ["0", "50", "12.50", "free"]) expect(checkPrice(bad)).toMatchObject({ ok: false, problem: "The price has to be a whole number of dollars from $1 to $49." });
  });

  it("opens an enrollment at the creator's price with that rubric's fingerprint locked, and grades on it", async () => {
    const course = publishCreatorCourse({ ...bread, title: "Bread at Home, for sale" }, "", 2900);
    expect(creatorCourse(course.id).priceCents).toBe(2900);
    const enrollment = createEnrollment("Pat Baker", "pat.baker@example.com", { courseId: course.id });
    expect(enrollment).toMatchObject({ courseId: course.id, courseSlug: course.id, priceCents: 2900, rubric: { fingerprint: course.fingerprint } });
    expect(boughtCreatorRubric(course.id, enrollment.rubric!.fingerprint)).toEqual(course.rubric);
    expect(() => boughtCreatorRubric(course.id, "000000000000")).toThrow(/no longer matches/);
    // The learner's screens get the creator's title and rubric.
    expect(viewEnrollment(enrollment).creatorCourse).toMatchObject({ id: course.id, title: "Bread at Home, for sale", path: `/c/${course.id}` });
  });

  it("counts an attempt complete when every question this course asked is answered, two here rather than the sample's four", () => {
    const attempt = { score: 40, answers: { q1: "Doubled", q2: "Steam" }, nearCopyOf: undefined, questionIds: ["q1", "q2"] };
    expect(attemptComplete(attempt)).toBe(true);
    expect(attemptComplete({ ...attempt, answers: { q1: "Doubled", q2: " " } })).toBe(false);
    // Without question ids it is the sample course, whose q3 and q4 are blank here.
    expect(attemptComplete({ ...attempt, questionIds: undefined })).toBe(false);
  });
});
