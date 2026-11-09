import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { CohortLoading, CohortScreen } from "@/components/course/cohort-screen";
import { cohortResponse } from "@/lib/course/cohort-response";
import { TEST_RUN_COOKIE } from "@/lib/course/team-access";

/** Built on the server for this request, so the first HTML already holds the numbers and the tables. */
async function CohortNow() {
  await connection();
  const testRun = (await cookies()).get(TEST_RUN_COOKIE)?.value === "1";
  return <CohortScreen cohort={cohortResponse({ includeTestRuns: testRun })} />;
}

export default function CohortPage() {
  return (
    <Suspense fallback={<CohortLoading />}>
      <CohortNow />
    </Suspense>
  );
}
