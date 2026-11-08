import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { rubric } from "@/lib/course/content";
import { checkFingerprint, lockRubric, rubricFingerprint, rubricText } from "@/lib/course/rubric-lock";

const v1 = { version: "1", rubric };
/** The creator edits one word of one line and sells it as v2. */
const edited = structuredClone(rubric);
edited.questions[0].items[0].text = edited.questions[0].items[0].text.replace(/\w+/, "Maybe");
const v2 = { version: "2", rubric: edited };

describe("a buyer checks the fingerprint on their receipt", () => {
  it("matches the public rubric when nothing has changed", () => {
    const lock = lockRubric();
    expect(checkFingerprint(lock)).toMatchObject({ status: "matches", boughtOnFile: true, onSale: { version: "1", fingerprint: lock.fingerprint } });
    // Typed the way the receipt prints it: groups of four, any case.
    const typed = lock.fingerprint.toUpperCase().match(/.{4}/g)!.join(" ");
    expect(checkFingerprint({ version: "1", fingerprint: typed }).status).toBe("matches");
  });

  it("says changed since you bought when the rubric on sale was edited, and that grading keeps the one bought", () => {
    const bought = { version: "1", fingerprint: rubricFingerprint(rubric) };
    expect(rubricFingerprint(edited)).not.toBe(bought.fingerprint);
    expect(checkFingerprint(bought, [v1, v2])).toEqual({ status: "changed", bought, onSale: { version: "2", fingerprint: rubricFingerprint(edited) }, boughtOnFile: true });
  });

  it("says changed, and not on file, for a fingerprint we never sold", () => {
    expect(checkFingerprint({ version: "1", fingerprint: "0000 0000 0000" })).toMatchObject({ status: "changed", boughtOnFile: false });
  });

  it("is the first 12 characters of the SHA-256 of the file a buyer can download", () => {
    const sha = createHash("sha256").update(rubricText(rubric)).digest("hex");
    expect(rubricFingerprint(rubric)).toBe(sha.slice(0, 12));
  });
});
