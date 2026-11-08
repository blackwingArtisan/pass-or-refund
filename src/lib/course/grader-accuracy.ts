/**
 * The grader's sealed held-out result (TK-44 notes, 2026-11-01, set grade-fresh-1; spec in
 * spikes/grade/fresh-1/FROZEN.md). The method was frozen before these attempts were graded, and
 * src/lib/grading/frozen/ is a byte copy of it (tests/unit/sealed-grading.test.ts checks the hashes).
 * Fixed figures, not computed here: changing the method voids them.
 */
export const GRADER_FRESH_SET = {
  attempts: 20,
  courses: 2,
  judges: 2,
  repeats: 4,
  injections: 3,
  /** Attempts both judges failed that the grader ever passed. */
  bothFailedButPassed: 0,
  /** Attempts both judges scored 80 or more that were ever refunded. */
  bothHighButRefunded: 0,
  /** Share of attempts both judges passed that came out passed, across the repeats. */
  bothPassedPassedPercent: { low: 89, high: 100 },
  /** Attempts with the same final outcome on every repeat. */
  sameOutcomePercent: 95,
  costPerDecisionUsd: { low: 0.018, high: 0.021 },
  /** Who wrote what: no real learner took part. */
  provenance: "The judges, the attempts and the grader are all Claude, and the attempts were written to land near the pass mark, so real learners will be messier.",
} as const;

/** The result as plain lines, the same on the home page and in the README. */
export function graderAccuracyLines(): string[] {
  const g = GRADER_FRESH_SET;
  return [
    `No attempt both judges failed was ever passed.`,
    `No attempt both judges scored 80 or more was ever refunded.`,
    `Attempts both judges passed came out passed ${g.bothPassedPassedPercent.low}-${g.bothPassedPassedPercent.high}% of the time.`,
    `The same outcome on ${g.sameOutcomePercent}% of repeats.`,
    `All ${g.injections} attempts that told the grader what to do were flagged, every time.`,
    `$${g.costPerDecisionUsd.low.toFixed(3)}-${g.costPerDecisionUsd.high.toFixed(3)} per decision, extra grades included.`,
  ];
}
