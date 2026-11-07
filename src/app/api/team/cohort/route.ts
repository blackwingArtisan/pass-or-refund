import { buildCohort } from "@/lib/course/cohort";
import { listEnrollments } from "@/lib/course/enrollments";
import { readSampleCohort } from "@/lib/course/sample-cohort";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const sample = readSampleCohort();
  const real = listEnrollments();
  return {
    ...buildCohort([...real, ...sample]),
    sampleLearners: sample.length,
    realLearners: real.filter((e) => e.status !== "unpaid").length,
    // Licence keys for browser libraries are public by design. Only sent when the sponsor UI is built in.
    studioLicenseKey: process.env.NEXT_PUBLIC_SPONSOR_UI === "1" ? process.env.AG_STUDIO_LICENSE_KEY : undefined,
  };
});
