/**
 * The learner counts every page shows, worked out once from the data /api/team/cohort returns,
 * so the home page, the receipt and /cohort can never claim a learner the data doesn't hold.
 */

export interface LearnerCounts {
  /** Made-up learners in the labelled sample cohort. */
  sample: number;
  /** People who paid on this site (test-suite buyers only count for a test run). */
  real: number;
  /** Learners of the first course who have taken the final check, sample and real. */
  graded: number;
  /** The one sentence every page uses for who is in the numbers. */
  line: string;
}

export function learnersLine(sample: number, real: number): string {
  const made = `${sample} made-up sample ${sample === 1 ? "learner" : "learners"}`;
  if (real === 0) return `${made}, no real ones yet`;
  return `${made} and ${real} real ${real === 1 ? "one" : "ones"}`;
}

export function learnerCounts(sample: number, real: number, graded: number): LearnerCounts {
  return { sample, real, graded, line: learnersLine(sample, real) };
}
