import { buildCohort } from "@/lib/course/cohort";
import { learnerCounts } from "@/lib/course/learner-counts";
import { listEnrollments } from "@/lib/course/enrollments";
import { readSampleCohort } from "@/lib/course/sample-cohort";
import { isTestRun } from "@/lib/course/team-access";
import { route } from "@/lib/http";

export const GET = route(async (req) => {
  const sample = readSampleCohort();
  // Test-suite buyers would move the numbers judges see, so they only count for a test run.
  // The cohort is the sample course's: creators' own courses have their own rubrics.
  const real = listEnrollments({ includeTestRuns: isTestRun(req) }).filter((e) => !e.courseId);
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
});
