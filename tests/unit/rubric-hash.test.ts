/** The fingerprint a buyer's browser works out is the server's, and one changed word changes it. */
import { describe, expect, it } from "vitest";
import { rubric as published } from "@/lib/course/content";
import { changedLine, fingerprintOf, fingerprintOfText, rubricLines, rubricText, withLine } from "@/lib/course/rubric-hash";
import { rubricFingerprint, rubricOnSale } from "@/lib/course/rubric-lock";
import { publicRubricBody } from "@/lib/course/verify";

describe("the rubric fingerprint in a browser", () => {
  it("is the server's fingerprint for the real rubric, byte for byte", async () => {
    expect(await fingerprintOf(published)).toBe(rubricFingerprint(published));
    expect(await fingerprintOf(published)).toBe(rubricOnSale().fingerprint);
    // The same text /api/rubric/v1.json serves.
    expect(await fingerprintOfText(rubricText(published))).toMatch(/^[0-9a-f]{12}$/);
  });

  it("differs after one marking line changes by one word, and names the line", async () => {
    const line = rubricLines(published)[2];
    const edited = withLine(published, line.key, line.text.replace(/\w+/, "Never"));
    const fp = await fingerprintOf(edited);
    expect(fp).not.toBe(rubricFingerprint(published));
    expect(fp).toBe(rubricFingerprint(edited));
    expect(changedLine(published, edited)).toEqual({ label: line.label, before: line.text, after: line.text.replace(/\w+/, "Never") });
    // The original is untouched.
    expect(await fingerprintOf(published)).toBe(rubricFingerprint(published));
  });

  it("an unchanged copy names no line, and lists every marking line once", () => {
    expect(changedLine(published, withLine(published, rubricLines(published)[0].key, rubricLines(published)[0].text))).toBeNull();
    const lines = rubricLines(published);
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
    expect(lines.length).toBe(published.questions.reduce((n, q) => n + q.items.length, 0));
  });

  it("/verify finds the public rubric body only for a fingerprint it hashes to", () => {
    const { version, fingerprint } = rubricOnSale();
    expect(publicRubricBody(version, fingerprint)).toEqual(published);
    expect(publicRubricBody(version, "000000000000")).toBeNull();
  });
});
