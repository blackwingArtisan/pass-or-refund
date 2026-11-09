import { describe, expect, it } from "vitest";
import { learnerCounts, learnersLine } from "@/lib/course/learner-counts";

describe("who is in the numbers", () => {
  it("says so plainly when nobody real has bought yet, as after a redeploy", () => {
    expect(learnersLine(36, 0)).toBe("36 made-up sample learners, no real ones yet");
  });

  it("counts real learners only when the data holds them", () => {
    expect(learnersLine(36, 1)).toBe("36 made-up sample learners and 1 real one");
    expect(learnersLine(36, 3)).toBe("36 made-up sample learners and 3 real ones");
  });

  it("keeps the counts and the sentence together", () => {
    expect(learnerCounts(36, 0, 36)).toEqual({ sample: 36, real: 0, graded: 36, line: "36 made-up sample learners, no real ones yet" });
  });
});
