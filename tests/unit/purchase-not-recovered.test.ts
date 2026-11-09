/**
 * A normal purchase is never called "recovered". The course page asks PayPal about the order while
 * its window is open; PayPal says COMPLETED as soon as it has taken the money, which is before our
 * own capture call has come back and been saved. That check must wait for the capture, not rebuild
 * the payment from PayPal's order as if the app had stopped. Only a payment the app really lost
 * (PayPal captured, no capture of ours running or saved) is rebuilt and shown as recovered.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireEnrollment } from "@/lib/course/enrollments";
import { checkCheckout, completePurchase, recoverPayment, startPurchase } from "@/lib/course/purchase";
import { getMockPayPal, getPayPal } from "@/lib/paypal";

/** Holds every capture's answer after PayPal has taken the money, until release() is called. */
function holdCaptureAnswers() {
  const mock = getMockPayPal()!;
  const capture = mock.orders.capture.bind(mock.orders);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let captured!: () => void;
  const atPayPal = new Promise<void>((r) => (captured = r));
  vi.spyOn(mock.orders, "capture").mockImplementation(async (...args: Parameters<typeof capture>) => {
    const order = await capture(...args);
    captured();
    await gate;
    return order;
  });
  return { atPayPal, release };
}

afterEach(() => vi.restoreAllMocks());

const buyer = (name: string) => startPurchase(name, `${name.toLowerCase().replace(" ", ".")}.${Date.now()}@example.com`);

describe("a normal card purchase is not a recovered one", () => {
  it("the page's check while the capture is still coming back waits for it, and the payment isn't marked recovered", async () => {
    const { enrollment, orderId } = await buyer("Cal Card");
    getMockPayPal()!.simulateBuyerApproval(orderId, { email: "cal@example.com" });
    const held = holdCaptureAnswers();
    const capturing = completePurchase(enrollment.id, orderId, "test");
    await held.atPayPal; // PayPal's order now says COMPLETED; our capture hasn't come back
    expect((await getPayPal().orders.get(orderId)).status).toBe("COMPLETED");
    const checking = checkCheckout(enrollment.id, "test");
    const looking = recoverPayment(requireEnrollment(enrollment.id));
    held.release();
    const [checked, looked, captured] = await Promise.all([checking, looking, capturing]);
    for (const e of [checked, looked, captured, requireEnrollment(enrollment.id)]) {
      expect(e).toMatchObject({ status: "active", payment: { captureStatus: "COMPLETED" } });
      expect(e.payment?.recovered).toBeUndefined();
    }
  });

  it("a check whose answer from PayPal arrives after the capture was saved keeps the saved payment", async () => {
    const { enrollment, orderId } = await buyer("Dee Late");
    getMockPayPal()!.simulateBuyerApproval(orderId, { email: "dee@example.com" });
    const mock = getMockPayPal()!;
    const get = mock.orders.get.bind(mock.orders);
    // The check reads the record, asks PayPal, and PayPal's answer only arrives once the capture is saved.
    let saved!: () => void;
    const captureSaved = new Promise<void>((r) => (saved = r));
    vi.spyOn(mock.orders, "get").mockImplementationOnce(async (...args: Parameters<typeof get>) => {
      await captureSaved;
      return get(...args);
    });
    const checking = checkCheckout(enrollment.id, "test");
    const captured = await completePurchase(enrollment.id, orderId, "test");
    saved();
    const checked = await checking;
    expect(captured.payment?.recovered).toBeUndefined();
    expect(checked.payment?.recovered).toBeUndefined();
    expect(requireEnrollment(enrollment.id).payment).toMatchObject({ captureId: captured.payment!.captureId, captureStatus: "COMPLETED" });
    expect(requireEnrollment(enrollment.id).payment?.recovered).toBeUndefined();
  });

  it("when the app really stopped after PayPal took the money, the check rebuilds the payment and calls it recovered", async () => {
    const { enrollment, orderId } = await buyer("Sol Stopped");
    getMockPayPal()!.simulateBuyerApproval(orderId, { email: "sol@example.com" });
    await getPayPal().orders.capture(orderId); // PayPal took it; no capture of ours ran or saved
    const checked = await checkCheckout(enrollment.id, "test");
    expect(checked).toMatchObject({ status: "active", payment: { recovered: true, captureStatus: "COMPLETED" } });
    const order = await getPayPal().orders.get(orderId);
    expect(order.purchase_units?.[0]?.payments?.captures).toHaveLength(1);
  });

  it("opening the record after the app stopped rebuilds it too", async () => {
    const { enrollment, orderId } = await buyer("Bo Reload");
    getMockPayPal()!.simulateBuyerApproval(orderId, { email: "bo@example.com" });
    await getPayPal().orders.capture(orderId);
    expect(await recoverPayment(requireEnrollment(enrollment.id))).toMatchObject({ status: "active", payment: { recovered: true } });
  });
});
