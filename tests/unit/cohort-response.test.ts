/** /cohort is rendered on the server from the same builder the API uses, so the two can't disagree. */
import { describe, expect, it } from "vitest";
import { cohortResponse } from "@/lib/course/cohort-response";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { getMockPayPal } from "@/lib/paypal";

describe("the cohort the page renders on the server", () => {
  it("holds the sample cohort's rubric items before anyone real buys, worst first", () => {
    const cohort = cohortResponse({ includeTestRuns: false });
    expect(cohort.sampleLearners).toBeGreaterThan(0);
    expect(cohort.items.length).toBeGreaterThan(0);
    const rates = cohort.items.map((i) => i.missRate);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });

  it("counts a test-suite buyer only for a test run", async () => {
    // Other test files share the store and may have left test-run buyers, so compare before and after this one.
    const before = { all: cohortResponse({ includeTestRuns: true }).realLearners, real: cohortResponse({ includeTestRuns: false }).realLearners };
    const email = `cohort.${Date.now()}@example.com`;
    const { enrollment, orderId } = await startPurchase("Cora Cohort", email, { testRun: true });
    getMockPayPal()!.simulateBuyerApproval(orderId, { email: `paypal.${email}` });
    await completePurchase(enrollment.id, orderId, "test");
    expect(cohortResponse({ includeTestRuns: true }).realLearners).toBe(before.all + 1);
    expect(cohortResponse({ includeTestRuns: false }).realLearners).toBe(before.real);
  });
});
