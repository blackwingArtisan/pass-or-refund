/** The made-up passing learner behind the home page's certificate link. */
import { describe, expect, it } from "vitest";
import { listEnrollments, viewEnrollment } from "@/lib/course/enrollments";
import { SAMPLE_PASS_ID } from "@/lib/course/sample-ids";
import { ensureSamplePass } from "@/lib/course/sample-pass";
import { rubric } from "@/lib/course/content";

describe("the sample passing learner", () => {
  it("passes on the strong sample answers, added up by the sealed scoring code, with no payment", () => {
    const sample = ensureSamplePass();
    expect(sample.id).toBe(SAMPLE_PASS_ID);
    expect(sample.status).toBe("passed");
    expect(sample.attempts[0].outcome).toBe("pass");
    expect(sample.attempts[0].score).toBeGreaterThanOrEqual(rubric.passMark);
    expect(sample.attempts[0].runs[0].items.length).toBe(rubric.questions.flatMap((q) => q.items).length);
    expect(sample.payment).toBeUndefined();
    expect(viewEnrollment(sample).status).toBe("passed");
  });

  it("is made once, and stays off the course team's list and the cohort's real learners", () => {
    const first = ensureSamplePass();
    expect(ensureSamplePass()).toEqual(first);
    expect(listEnrollments().map((e) => e.id)).not.toContain(SAMPLE_PASS_ID);
  });
});
