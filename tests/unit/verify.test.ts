/** /verify: PayPal's record of an order, read back, against the public rubric's hash. */
import { describe, expect, it } from "vitest";
import { completePurchase, startPurchase } from "@/lib/course/purchase";
import { rubricFingerprint, rubricOnSaleNow } from "@/lib/course/rubric-lock";
import { parseVerifyQuery, publicRubricFor, termsOnOrder, verifyOnPayPal } from "@/lib/course/verify";
import { getMockPayPal, getPayPal } from "@/lib/paypal";

const onSale = rubricOnSaleNow();
const fp = rubricFingerprint(onSale.rubric);

async function paidOrder(name: string) {
  const { enrollment, orderId } = await startPurchase(name, `${name.replace(" ", ".").toLowerCase()}.${Date.now()}@example.com`);
  getMockPayPal()!.simulateBuyerApproval(orderId, { email: "verify@example.com" });
  await completePurchase(enrollment.id, orderId, "test");
  const order = await getPayPal().orders.get(orderId);
  return { enrollment, orderId, invoiceId: order.purchase_units![0].invoice_id! };
}

describe("verify a purchase on PayPal", () => {
  it("reads an order id or one of this app's invoice ids, and nothing else", () => {
    expect(parseVerifyQuery(" 5yn554220w4690159 ")).toEqual({ kind: "order", orderId: "5YN554220W4690159" });
    expect(parseVerifyQuery(`PR-v1-${fp}-en_1a2b3c4d`)).toMatchObject({ kind: "invoice", version: "1", fingerprint: fp, enrollmentId: "en_1a2b3c4d" });
    for (const junk of ["", "hello", "PR-v1-zzz-en_1", "5YN554220W469015", "<script>"]) expect(parseVerifyQuery(junk)).toBeNull();
  });

  it("takes the terms from PayPal's invoice_id and item line, and says when the two disagree", () => {
    const unit = (invoice: string, name: string) => ({ purchase_units: [{ invoice_id: invoice, items: [{ name, description: "x", quantity: "1", unit_amount: { currency_code: "USD", value: "49.00" } }] }] }) as never;
    expect(termsOnOrder(unit(`PR-v1-${fp}-en_a`, `Course · rubric v1 · ${fp}`))).toMatchObject({ version: "1", fingerprint: fp, agree: true });
    expect(termsOnOrder(unit(`PR-v1-${fp}-en_a`, "Course · rubric v1 · 000000000000")).agree).toBe(false);
  });

  it("finds the public rubric by hashing it, so a fingerprint nobody published matches nothing", () => {
    expect(publicRubricFor(onSale.version, fp)).toMatchObject({ version: onSale.version, fingerprint: fp, href: `/rubric?v=${onSale.version}&fp=${fp}` });
    expect(publicRubricFor(onSale.version, "000000000000")).toBeNull();
  });

  it("a paid order, by order id or by invoice id: PayPal's terms match the public rubric", async () => {
    const { orderId, invoiceId } = await paidOrder("Vera Verify");
    for (const q of [orderId, invoiceId]) {
      const v = await verifyOnPayPal(q);
      expect(v).toMatchObject({ status: "match", orderId, orderStatus: "COMPLETED", call: `GET /v2/checkout/orders/${orderId}` });
      expect(v.paypal).toMatchObject({ invoiceId, version: onSale.version, fingerprint: fp, agree: true });
      expect(v.paypal?.guarantee).toContain("Full refund if you fail the public final check twice.");
      expect(v.rubric?.fingerprint).toBe(fp);
    }
  });

  it("shows no learner data: no name, email or payer", async () => {
    const { orderId } = await paidOrder("Priya Private");
    const shown = JSON.stringify(await verifyOnPayPal(orderId));
    expect(shown).not.toMatch(/Priya|Private|@example\.com|payer/i);
  });

  it("an invoice id whose fingerprint isn't the one on PayPal's order doesn't match", async () => {
    const { enrollment } = await paidOrder("Tad Tamper");
    const v = await verifyOnPayPal(`PR-v1-000000000000-${enrollment.id}`);
    expect(v).toMatchObject({ status: "no-match", reason: expect.stringContaining("different invoice id") });
  });

  it("an order with no course terms, an unknown order and an unknown invoice say so", async () => {
    const plain = await getPayPal().orders.create({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: "USD", value: "5.00" } }] });
    expect(await verifyOnPayPal(plain.id)).toMatchObject({ status: "no-terms" });
    expect(await verifyOnPayPal("0000000000000000X")).toMatchObject({ status: "not-found" });
    expect(await verifyOnPayPal(`PR-v1-${fp}-en_nosuchone`)).toMatchObject({ status: "not-found" });
    expect(await verifyOnPayPal("not an id")).toMatchObject({ status: "unrecognised" });
  });
});
