import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lessonForItem, rubric } from "@/lib/course/content";
import { BAND_HIGH, BAND_LOW, isDecidedByFirstGrade, medianOfThree, outcomeOfFirstGrade, outcomeOfMedian } from "@/lib/grading/decide";
import { promptFingerprint } from "@/lib/grading/frozen/prompts";

/** The sealed method's files, hashed in spikes/grade/fresh-1/hashes/. Any change voids the result. */
const SEALED: Record<string, string> = {
  "packet.ts": "a6314c46073d02a0d2c656e1395f54819ebbdfb22cbc900c80e685650d3a14a0",
  "prompts.ts": "fb613a0889a2ab76a1387c7c3795cada78e41b67d7b8e328ae525d062d7c1cfa",
  "rules.ts": "12534ee39d326444fbf05623698139f96caeb1bdbb4843c661ed45e855d1abf9",
  "schemas.ts": "6b5ab9c913f9d5c78edbeb0ee96960360279ff98b245b12ba24b36c6f9b92c5d",
  "score-items.ts": "2dd33cc096509942fcc65a8f948228060361b8b9b59528921ddfb8339c59fd78",
};

describe("sealed grading method", () => {
  it.each(Object.entries(SEALED))("%s is byte for byte the sealed copy", (file, hash) => {
    const bytes = fs.readFileSync(path.join("src/lib/grading/frozen", file));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
  });

  it("uses the sealed prompt variant", () => {
    const fingerprint = createHash("sha256").update(promptFingerprint("checklist", "strict")).digest("hex");
    expect(fingerprint).toBe("34cbf0cff229c50c2e2e32c8e47b501f72bb11b6008146addac881352a2fd48b");
  });
});

describe("decision band", () => {
  it("decides from one grade only outside the band", () => {
    expect(BAND_LOW).toBe(66);
    expect(BAND_HIGH).toBe(73);
    expect([65, 66, 73, 74].map(isDecidedByFirstGrade)).toEqual([true, false, false, true]);
    expect(outcomeOfFirstGrade(65)).toBe("fail");
    expect(outcomeOfFirstGrade(74)).toBe("pass");
    expect(() => outcomeOfFirstGrade(70)).toThrow();
  });

  it("uses the median of three inside the band", () => {
    expect(medianOfThree([72, 68, 69])).toBe(69);
    expect([68, 69, 70, 71].map(outcomeOfMedian)).toEqual(["fail", "review", "review", "pass"]);
  });
});

describe("the course rubric", () => {
  it("has four questions worth 25 points each", () => {
    expect(rubric.questions).toHaveLength(4);
    for (const question of rubric.questions) {
      expect(question.points).toBe(25);
      expect(question.items.reduce((sum, item) => sum + item.points, 0)).toBe(25);
    }
  });

  it("keeps every item between 3 and 15 points and ties it to a lesson", () => {
    for (const item of rubric.questions.flatMap((q) => q.items)) {
      expect(item.points).toBeGreaterThanOrEqual(3);
      expect(item.points).toBeLessThanOrEqual(15);
      expect(lessonForItem[item.id]).toBeDefined();
    }
  });
});
