import { buildCohort } from "@/lib/course/cohort";
import { listEnrollments } from "@/lib/course/enrollments";
import { readSampleCohort } from "@/lib/course/sample-cohort";
import { isTestRun } from "@/lib/course/team-access";
import { route } from "@/lib/http";

export const GET = route(async (req) => {
  const sample = readSampleCohort();
  // Test-suite buyers would move the numbers judges see, so they only count for a test run.
  const real = listEnrollments({ includeTestRuns: isTestRun(req) });
  return {
    ...buildCohort([...real, ...sample]),
    sampleLearners: sample.length,
    realLearners: real.filter((e) => e.status !== "unpaid").length,
    // Licence keys for browser libraries are public by design. Only sent when the sponsor UI is built in.
    studioLicenseKey: process.env.NEXT_PUBLIC_SPONSOR_UI === "1" ? process.env.AG_STUDIO_LICENSE_KEY : undefined,
  };
});
