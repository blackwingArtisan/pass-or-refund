/** The course team's side of the guarantee, in public: declines with their note, and decisions left too long. */
import { describe, expect, it, vi } from "vitest";
import { getApprovals } from "@/lib/agent/approvals";
import { submitAttempt } from "@/lib/course/attempts";
import { buildCohort } from "@/lib/course/cohort";
import { requireEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { retryRefund } from "@/lib/course/refund";
import { samples } from "@/lib/course/samples";
import { getMockPayPal } from "@/lib/paypal";
import { readyForNextAttempt } from "./course-helpers";

const CHANNEL = "test";
const WAIT = { timeout: 5_000, interval: 25 };

let learners = 0;
async function failTwice() {
  const email = `public-learner${++learners}@example.com`;
  const { enrollment, orderId } = await startPurchase("Alex Rivera", email);
  getMockPayPal()!.simulateBuyerApproval(orderId, { email: `paypal.${email}` });
  const { id } = await completePurchase(enrollment.id, orderId, CHANNEL);
  await submitAttempt(id, samples.fail1, CHANNEL);
  readyForNextAttempt(id);
  await submitAttempt(id, samples.fail2, CHANNEL);
  return id;
}

const approvalOf = (id: string) =>
  vi.waitFor(() => {
    const approval = viewEnrollment(requireEnrollment(id)).approval;
    if (!approval) throw new Error("No approval yet");
    return approval;
  }, WAIT);

const statusOf = (id: string, status: string) => vi.waitFor(() => expect(requireEnrollment(id).status).toBe(status), WAIT);

describe("declines and late decisions are public", () => {
  it("an approval nobody decides is marked overdue on /team and /cohort, until someone asks again", async () => {
    const id = await failTwice();
    const approval = await approvalOf(id);
    getApprovals().runOut(approval.id, 3);
    await statusOf(id, "refund_blocked");
    const blocked = requireEnrollment(id);
    expect(blocked.refund?.error).toMatch(/decided in time/);
    expect(viewEnrollment(blocked).overdue?.label).toBe("overdue, 3 hours");
    const cohort = buildCohort([blocked]);
    expect(cohort.overdue).toEqual([expect.objectContaining({ id, label: "overdue, 3 hours", state: "Blocked" })]);
    expect(cohort.sources.refunds[0].overdue).toBe("overdue, 3 hours");
    expect(JSON.stringify(cohort)).not.toContain(blocked.learnerName);

    const { finished } = await retryRefund(id, CHANNEL);
    const again = await approvalOf(id);
    expect(viewEnrollment(requireEnrollment(id)).overdue).toBeNull();
    expect(buildCohort([requireEnrollment(id)]).overdue).toEqual([]);
    getApprovals().decide(again.id, "denied", "test", "Done");
    await finished;
  });

  it("a declined refund is listed on /cohort with the note the learner was given", async () => {
    const id = await failTwice();
    getApprovals().decide((await approvalOf(id)).id, "denied", "course team", "The second attempt was copied from a classmate.");
    await statusOf(id, "refund_declined");
    const cohort = buildCohort([requireEnrollment(id)]);
    expect(cohort.declines).toEqual([expect.objectContaining({ id, note: "The second attempt was copied from a classmate.", by: "course team" })]);
    expect(cohort.overdue).toEqual([]);
    expect(JSON.stringify(cohort.declines)).not.toContain("Alex Rivera");
  });
});
