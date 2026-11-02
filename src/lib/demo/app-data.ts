/**
 * APP-OWNED: seed your app's own records here.
 * Called by `npm run seed` and the "Load demo data" button after the PayPal demo data.
 */
import { seedSampleCohort } from "@/lib/course/sample-cohort";

export async function seedAppData(): Promise<void> {
  seedSampleCohort();
}
