/** PayPal's window and the page's own check can both reach one purchase at once. */
import { describe, expect, it } from "vitest";
import { requireEnrollment } from "@/lib/course/enrollments";
import { checkCheckout, completePurchase, recoverPayment, startPurchase } from "@/lib/course/purchase";
import { getMockPayPal, getPayPal } from "@/lib/paypal";

describe("one purchase, two paths finishing it", () => {
  it("a look at the record while the capture is on its way back waits for it, and doesn't call the payment rebuilt", async () => {
    const { enrollment, orderId } = await startPurchase("Rae Race", `race.${Date.now()}@example.com`);
    getMockPayPal()!.simulateBuyerApproval(orderId, { email: "race@example.com" });
    const capturing = completePurchase(enrollment.id, orderId, "test");
    const [looked, checked, captured] = await Promise.all([recoverPayment(requireEnrollment(enrollment.id)), checkCheckout(enrollment.id, "test"), capturing]);
    for (const e of [looked, checked, captured, requireEnrollment(enrollment.id)]) expect(e).toMatchObject({ status: "active", payment: { captureStatus: "COMPLETED" } });
    expect(requireEnrollment(enrollment.id).payment?.recovered).toBeUndefined();
    const order = await getPayPal().orders.get(orderId);
    expect(order.purchase_units?.[0]?.payments?.captures).toHaveLength(1);
  });
});
