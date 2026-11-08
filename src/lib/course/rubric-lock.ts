/**
 * The guarantee's terms can't move after purchase. Each purchase locks the rubric version and its
 * fingerprint; grading looks the version up and refuses if the text no longer matches. A creator
 * who edits the rubric adds a new version here, and earlier buyers keep the one they bought.
 * Server only.
 */
import { createHash } from "node:crypto";
import type { Rubric } from "@/lib/grading/frozen/score-items";
import { HttpError } from "@/lib/http";
import { rubric as published } from "./content";
import type { Enrollment, RubricLock } from "./types";

/** Every rubric version ever sold, oldest first. The last one is on sale now. */
const VERSIONS: { version: string; rubric: Rubric }[] = [{ version: "1", rubric: published }];

export const rubricFingerprint = (rubric: Rubric) => createHash("sha256").update(JSON.stringify(rubric)).digest("hex").slice(0, 12);

/** What a buyer gets today: shown on the course page before they pay. */
export function rubricOnSale(): Omit<RubricLock, "lockedAt"> {
  const { version, rubric } = VERSIONS.at(-1)!;
  return { version, fingerprint: rubricFingerprint(rubric) };
}

export const lockRubric = (): RubricLock => ({ ...rubricOnSale(), lockedAt: new Date().toISOString() });

/** The rubric this learner bought. Grading stops rather than use different words. */
export function lockedRubric(enrollment: Pick<Enrollment, "rubric">): Rubric {
  const lock = enrollment.rubric ?? { version: VERSIONS[0].version, fingerprint: rubricFingerprint(VERSIONS[0].rubric) };
  const found = VERSIONS.find((v) => v.version === lock.version);
  if (!found || rubricFingerprint(found.rubric) !== lock.fingerprint) {
    throw new HttpError(409, "The rubric you bought no longer matches what's on file, so grading stopped and nothing was counted. The course team has been told.", "rubric_changed");
  }
  return found.rubric;
}
