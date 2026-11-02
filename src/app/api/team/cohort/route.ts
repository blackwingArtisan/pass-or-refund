import { buildCohort } from "@/lib/course/cohort";
import { listEnrollments } from "@/lib/course/enrollments";
import { sampleCohort } from "@/lib/course/sample-cohort";
import { getEnv } from "@/lib/env";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const sample = getEnv().paypalMode === "mock" ? sampleCohort().list() : [];
  return {
    ...buildCohort([...listEnrollments(), ...sample]),
    sampleLearners: sample.length,
    // Licence keys for browser libraries are public by design. Only sent when the sponsor UI is built in.
    studioLicenseKey: process.env.NEXT_PUBLIC_SPONSOR_UI === "1" ? process.env.AG_STUDIO_LICENSE_KEY : undefined,
  };
});
