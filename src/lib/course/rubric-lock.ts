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
import { rubricText } from "./rubric-hash";
import type { Enrollment, RubricLock } from "./types";

type Version = { version: string; rubric: Rubric };

/** Every rubric version ever sold, oldest first. The last one is on sale now. */
const VERSIONS: Version[] = [{ version: "1", rubric: published }];

/** The exact bytes the fingerprint is taken from, so a buyer can hash them too (in a browser: rubric-hash.ts). */
export { rubricText };

export const rubricFingerprint = (rubric: Rubric) => createHash("sha256").update(rubricText(rubric)).digest("hex").slice(0, 12);

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

/** The rubric of one version, for the public rubric page and its download. */
export function rubricVersion(version: string, versions: Version[] = VERSIONS): Version | undefined {
  return versions.find((v) => v.version === version);
}

export const rubricOnSaleNow = (versions: Version[] = VERSIONS) => versions.at(-1)!;

/** "3f2a 9c1e 04b7" or "3F2A9C1E04B7" both read as the same fingerprint. */
export const normalFingerprint = (text: string) => text.toLowerCase().replace(/[^0-9a-f]/g, "");

export interface FingerprintCheck {
  /** "matches": the rubric on sale is the one bought. "changed": the rubric on sale differs from it. */
  status: "matches" | "changed";
  bought: { version: string; fingerprint: string };
  onSale: { version: string; fingerprint: string };
  /** The version bought is still on file with the same fingerprint, so grading still uses it. */
  boughtOnFile: boolean;
}

/** A buyer's check: the fingerprint on their receipt or certificate against the public rubric. */
export function checkFingerprint(lock: { version: string; fingerprint: string }, versions: Version[] = VERSIONS): FingerprintCheck {
  const bought = { version: lock.version, fingerprint: normalFingerprint(lock.fingerprint) };
  const sale = rubricOnSaleNow(versions);
  const onSale = { version: sale.version, fingerprint: rubricFingerprint(sale.rubric) };
  const kept = rubricVersion(bought.version, versions);
  return {
    status: bought.fingerprint === onSale.fingerprint ? "matches" : "changed",
    bought,
    onSale,
    boughtOnFile: Boolean(kept && rubricFingerprint(kept.rubric) === bought.fingerprint),
  };
}
