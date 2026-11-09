import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApprovals } from "@/lib/agent/approvals";
import { submitAttempt } from "@/lib/course/attempts";
import { COURSE_PRICE_CENTS, course } from "@/lib/course/content";
import { requireEnrollment, viewEnrollment } from "@/lib/course/enrollments";
import { checkOrderTerms, invoiceIdFor, itemNameFor, orderPurchaseUnit, readOrderTerms, refundNoteFor, REFUND_RULE } from "@/lib/course/order-terms";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { rubricOnSale } from "@/lib/course/rubric-lock";
import { samples } from "@/lib/course/samples";
import { getMockPayPal, getPayPal } from "@/lib/paypal";
import { readyForNextAttempt } from "./course-helpers";

const CHANNEL = "test";
let learners = 0;

async function buy() {
  const email = `terms${++learners}@example.com`;
  const { enrollment, orderId } = await startPurchase("Rae Terms", email);
  getMockPayPal()!.simulateBuyerApproval(orderId, { email: `paypal.${email}` });
  return completePurchase(enrollment.id, orderId, CHANNEL);
}

const WAIT = { timeout: 5_000, interval: 25 };

describe("the guarantee on PayPal's order", () => {
  it("puts the rubric version, fingerprint and refund rule on the order's item line, with a unique invoice_id", async () => {
    const { version, fingerprint } = rubricOnSale();
    const first = await buy();
    const second = await buy();
    const order = await getPayPal().orders.get(first.payment!.orderId);
    const unit = order.purchase_units![0];
    expect(unit.invoice_id).toBe(`PR-v${version}-${fingerprint}-${first.id}`);
    expect(unit.custom_id).toBe(first.id);
    expect(unit.items).toHaveLength(1);
    expect(unit.items![0].name).toBe(`${course.title} · rubric v${version} · ${fingerprint}`);
    expect(unit.items![0].description).toContain(REFUND_RULE);
    expect(unit.items![0]).toMatchObject({ quantity: "1", unit_amount: { currency_code: "USD", value: "49.00" } });
    expect(unit.amount.breakdown?.item_total).toEqual({ currency_code: "USD", value: "49.00" });
    expect(invoiceIdFor(second)).not.toBe(unit.invoice_id);
    expect(unit.invoice_id!.length).toBeLessThanOrEqual(127);
  });

  it("cuts a long course title, never the terms, to fit PayPal's 127 characters", () => {
    const lock = { version: "3", fingerprint: "0123456789ab", lockedAt: "" };
    const name = itemNameFor({ rubric: lock });
    expect(name).toContain("rubric v3 · 0123456789ab");
    const unit = orderPurchaseUnit({ id: "en_x", rubric: lock, priceCents: 4900 }, "d");
    expect(unit.items![0].name.length).toBeLessThanOrEqual(127);
  });

  it("matches PayPal's order three ways, and says changed when the order carries another fingerprint", async () => {
    const enrollment = await buy();
    const check = await readOrderTerms(enrollment.id);
    expect(check).toMatchObject({ status: "matches", orderId: enrollment.payment!.orderId, invoiceId: invoiceIdFor(enrollment) });
    // A rubric edited after purchase: PayPal's record still holds the fingerprint bought, so the purchase no longer agrees with it.
    const edited = { ...enrollment, rubric: { ...enrollment.rubric!, fingerprint: "ffffffffffff" } };
    const order = await getPayPal().orders.get(enrollment.payment!.orderId);
    expect(checkOrderTerms(edited, order).status).toBe("changed");
    // An order from before terms went on PayPal.
    expect(checkOrderTerms(enrollment, { id: "O1", purchase_units: [{ reference_id: "default", amount: { currency_code: "USD", value: "49.00" } }] }).status).toBe("missing");
  });
});

describe("the refund PayPal sends", () => {
  beforeEach(() => vi.useRealTimers());

  it("carries the order's invoice_id and a note with the scores, built by code, and the record keeps PayPal's read-back", async () => {
    const { id } = await buy();
    await submitAttempt(id, samples.fail1, CHANNEL);
    readyForNextAttempt(id);
    await submitAttempt(id, samples.fail2, CHANNEL);
    const approval = await vi.waitFor(() => {
      const a = viewEnrollment(requireEnrollment(id)).approval;
      if (!a) throw new Error("No approval yet");
      return a;
    }, WAIT);
    getApprovals().decide(approval.id, "approved", "test");
    await vi.waitFor(() => expect(requireEnrollment(id).status).toBe("refunded"), WAIT);

    const enrollment = requireEnrollment(id);
    const [a1, a2] = enrollment.attempts.map((a) => a.score);
    const { fingerprint, version } = enrollment.rubric!;
    const note = `Guarantee refund, rubric v${version} ${fingerprint}: scored ${a1} and ${a2}, pass mark ${course.passMark}. Sorry we let you down.`;
    expect(refundNoteFor(enrollment)).toBe(note);
    const paid = await getPayPal().payments.getRefund(enrollment.refund!.refundId!);
    expect(paid.note_to_payer).toBe(note);
    expect(paid.invoice_id).toBe(invoiceIdFor(enrollment));
    expect(enrollment.refund).toMatchObject({ paypalNote: note, paypalInvoiceId: invoiceIdFor(enrollment), refundedCents: COURSE_PRICE_CENTS });
  });
});
