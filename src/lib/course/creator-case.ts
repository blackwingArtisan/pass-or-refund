/**
 * The creator's side of the guarantee, in numbers code works out: the knobs, the refund rate on
 * the sample cohort, what one grade costs, and what a sale is worth after refunds and grading.
 * Nothing here is a claim about real creators; the refund rate is from made-up learners.
 */
import { buildCohort } from "./cohort";
import { course, COURSE_PRICE_CENTS } from "./content";
import { ATTEMPT_GAP_HOURS, FAILS_FOR_REFUND, MIN_POINTS_FOR_REFUND, NEAR_COPY_SIMILARITY } from "./policy";
import { sampleEnrollments } from "./sample-cohort";

/**
 * What one real grade of the four-answer check cost on Claude Sonnet 5.5, from the app's own
 * spend log (src/lib/ai/cost.ts prices the tokens). A score of 66 to 73 is graded three times.
 */
export const GRADE_COST_USD = 0.014;

export function creatorCase() {
  const sample = sampleEnrollments(Date.parse("2026-11-01T00:00:00.000Z"));
  const cohort = buildCohort(sample);
  const learners = cohort.courses.reduce((total, c) => total + c.learners, 0);
  const refunds = cohort.courses.reduce((total, c) => total + c.refunds, 0);
  const passed = cohort.courses.reduce((total, c) => total + c.passed, 0);
  const grades = sample.reduce((total, e) => total + e.attempts.reduce((runs, a) => runs + a.runs.length, 0), 0);
  const refundRate = learners ? refunds / learners : 0;
  const gradingCentsPerLearner = learners ? (grades * GRADE_COST_USD * 100) / learners : 0;
  return {
    priceCents: COURSE_PRICE_CENTS,
    passMark: course.passMark,
    failsForRefund: FAILS_FOR_REFUND,
    gapHours: ATTEMPT_GAP_HOURS,
    minPoints: MIN_POINTS_FOR_REFUND,
    nearCopyPercent: Math.round(NEAR_COPY_SIMILARITY * 100),
    learners,
    passed,
    refunds,
    refundRate,
    gradeCostUsd: GRADE_COST_USD,
    /** Average kept per sale, before PayPal's fees: the price less refunds paid and grading. */
    keptPerSaleCents: Math.round(COURSE_PRICE_CENTS * (1 - refundRate) - gradingCentsPerLearner),
  };
}
