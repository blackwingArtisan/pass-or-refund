/** A creator's earnings card: only what PayPal's own records say, read back with GET. */
import { describe, expect, it } from "vitest";
import { courseInvoiceMatch, readCourseEarnings, sumEarnings } from "@/lib/course/course-earnings";
import { publishCreatorCourse } from "@/lib/course/creator-courses";
import { rubric } from "@/lib/course/content";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { getMockPayPal, getPayPal } from "@/lib/paypal";
import type { Order } from "@/lib/paypal/types";

const usd = (value: string) => ({ currency_code: "USD", value });
const order = (id: string, invoiceId: string, captured: string, refunds: { value: string; status: string }[] = []) =>
  ({
    id,
    status: "COMPLETED",
    purchase_units: [{ invoice_id: invoiceId, amount: usd(captured), payments: { captures: [{ id: `C${id}`, status: refunds.length ? "REFUNDED" : "COMPLETED", amount: usd(captured) }], refunds: refunds.map((r, i) => ({ id: `R${id}${i}`, status: r.status, amount: usd(r.value) })) } }],
  }) as unknown as Order;

describe("adding up a course's PayPal orders", () => {
  const fp = "0123456789ab";
  it("counts sold, refunded, net and the refund rate from PayPal's captures and refunds", () => {
    const sum = sumEarnings([order("A", `PR-v1-${fp}-en_1`, "29.00", [{ value: "29.00", status: "COMPLETED" }]), order("B", `PR-v1-${fp}-en_2`, "29.00"), order("C", `PR-v1-${fp}-en_3`, "29.00")], fp);
    expect(sum).toMatchObject({ sales: 3, refunds: 1, soldCents: 8700, refundedCents: 2900, netCents: 5800, pendingRefundCents: 0, leftOut: 0 });
    expect(sum.refundRate).toBeCloseTo(1 / 3);
  });

  it("leaves out an order PayPal didn't return, or one whose invoice_id is another course's", () => {
    const sum = sumEarnings([order("A", `PR-v1-${fp}-en_1`, "29.00"), null, order("X", "PR-v1-ffffffffffff-en_9", "49.00")], fp);
    expect(sum).toMatchObject({ sales: 1, soldCents: 2900, leftOut: 2 });
    expect(courseInvoiceMatch(fp).test(`PR-v12-${fp}-en_1`)).toBe(true);
    expect(courseInvoiceMatch(fp).test(`PR-v1-${fp}0-en_1`)).toBe(false);
  });

  it("doesn't count a PENDING refund as refunded until PayPal completes it", () => {
    const sum = sumEarnings([order("A", `PR-v1-${fp}-en_1`, "29.00", [{ value: "29.00", status: "PENDING" }])], fp);
    expect(sum).toMatchObject({ refundedCents: 0, refunds: 0, pendingRefundCents: 2900, netCents: 2900 });
  });

  it("is zero, not NaN, before the first sale", () => {
    expect(sumEarnings([], fp)).toMatchObject({ sales: 0, refundRate: 0, netCents: 0 });
  });
});

describe("a creator's course, read back from PayPal", () => {
  it("sells at the creator's own price and counts a refund PayPal made, even one the app never recorded", async () => {
    const own = publishCreatorCourse({ ...rubric, title: `Earnings ${Date.now().toString(36)}` }, "", 3900);
    const buy = async (name: string) => {
      const email = `${name.toLowerCase()}.${Date.now()}@example.com`;
      const { enrollment, orderId } = await startPurchase(name, email, { courseId: own.id, testRun: true });
      getMockPayPal()!.simulateBuyerApproval(orderId, { email: `paypal.${email}` });
      return completePurchase(enrollment.id, orderId, "test");
    };
    const first = await buy("Ena");
    await buy("Eli");
    expect(first.payment?.capturedCents).toBe(3900);
    await getPayPal().payments.refundCapture(first.payment!.captureId!);

    const earnings = await readCourseEarnings(own.id, { includeTestRuns: true });
    expect(earnings).toMatchObject({ priceCents: 3900, sales: 2, refunds: 1, soldCents: 7800, refundedCents: 3900, netCents: 3900, refundRate: 0.5, calls: 2, leftOut: 0 });
    expect(earnings.orders.map((o) => o.invoiceId)).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^PR-v1-${own.fingerprint}-en_`))]));
    // A visitor who isn't a test run doesn't see the suite's purchases.
    expect((await readCourseEarnings(own.id, { includeTestRuns: false })).sales).toBe(0);
  });
});
