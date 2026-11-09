import { buildCohort, type Cohort } from "./cohort";
import { learnerCounts, type LearnerCounts } from "./learner-counts";
import { listEnrollments } from "./enrollments";
import { readSampleCohort } from "./sample-cohort";

export interface CohortResponse extends Cohort {
  sampleLearners: number;
  realLearners: number;
  learners: LearnerCounts;
  studioLicenseKey?: string;
}

/**
 * What /cohort shows, built once for both the page's server render and /api/team/cohort, so the first
 * HTML already holds the numbers and the API can't disagree with it.
 */
export function cohortResponse({ includeTestRuns }: { includeTestRuns: boolean }): CohortResponse {
  const sample = readSampleCohort();
  // Test-suite buyers would move the numbers judges see, so they only count for a test run.
  // The cohort is the sample course's: creators' own courses have their own rubrics.
  const real = listEnrollments({ includeTestRuns }).filter((e) => !e.courseId);
  const cohort = buildCohort([...real, ...sample]);
  const realLearners = real.filter((e) => e.status !== "unpaid").length;
  return {
    ...cohort,
    sampleLearners: sample.length,
    realLearners,
    // Every page words its learner counts from this, so none can disagree with this response.
    learners: learnerCounts(sample.length, realLearners, cohort.courses[0]?.learners ?? 0),
    // Licence keys for browser libraries are public by design. Only sent when the sponsor UI is built in.
    studioLicenseKey: process.env.NEXT_PUBLIC_SPONSOR_UI === "1" ? process.env.AG_STUDIO_LICENSE_KEY : undefined,
  };
}
