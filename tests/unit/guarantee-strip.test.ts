import { describe, expect, it } from "vitest";
import { rubric } from "@/lib/course/content";
import { fingerprintOnOrder, guaranteeLine, invoiceIdFor, threeWayTicks } from "@/lib/course/guarantee-terms";
import { checkOrderTerms, itemNameFor } from "@/lib/course/order-terms";
import { FAILS_FOR_REFUND } from "@/lib/course/policy";
import { rubricFingerprint } from "@/lib/course/rubric-lock";

const fp = rubricFingerprint(rubric);
const enrollment = { id: "en_0a1b2c3d", courseId: "sharp-at-home", rubric: { version: "1", fingerprint: fp, lockedAt: "2026-11-09T00:00:00.000Z" } };

describe("the learner's guarantee strip", () => {
  it("states the price paid, the pass mark, two tries and the refund in one line", () => {
    const line = guaranteeLine({ priceCents: 4900, passMark: rubric.passMark });
    expect(FAILS_FOR_REFUND).toBe(2);
    expect(line).toEqual({ price: "$49.00", passMark: `Pass mark ${rubric.passMark} of 100`, tries: "Two tries", refund: "Fail both and PayPal pays back the full $49.00, once a person approves." });
    expect(guaranteeLine({ priceCents: 2900, passMark: 60 }).refund).toContain("$29.00");
  });

  it("prints the same invoice_id the order is created with", () => {
    expect(invoiceIdFor(enrollment)).toBe(`PR-v1-${fp}-en_0a1b2c3d`);
  });
});

describe("the three-column tick on /rubric", () => {
  const order = (itemName: string | undefined, invoiceId: string | undefined) => ({ id: "3B616040ST1440937", purchase_units: [{ invoice_id: invoiceId, items: itemName ? [{ name: itemName }] : undefined }] }) as never;
  const read = (terms: ReturnType<typeof checkOrderTerms>) => ({ fingerprint: fingerprintOnOrder(terms), source: "PayPal" });

  it("reads the fingerprint off PayPal's item line, or its invoice_id", () => {
    expect(fingerprintOnOrder({ itemName: itemNameFor(enrollment) })).toBe(fp);
    expect(fingerprintOnOrder({ invoiceId: invoiceIdFor(enrollment) })).toBe(fp);
    expect(fingerprintOnOrder({})).toBeUndefined();
  });

  it("ticks all three when the receipt, the rubric on sale and PayPal's order carry one fingerprint", () => {
    const terms = checkOrderTerms(enrollment, order(itemNameFor(enrollment), invoiceIdFor(enrollment)));
    const cols = threeWayTicks({ receipt: { fingerprint: fp, source: "receipt" }, boughtOnFile: true, onSale: { fingerprint: fp, source: "sale" }, paypal: read(terms) });
    expect(cols.map((c) => [c.key, c.status])).toEqual([
      ["receipt", "tick"],
      ["on-sale", "tick"],
      ["paypal", "tick"],
    ]);
  });

  it("crosses only the column that differs", () => {
    const other = fp.slice(0, -1) + (fp.endsWith("0") ? "1" : "0");
    const edited = checkOrderTerms(enrollment, order(`Sharp at Home · rubric v1 · ${other}`, invoiceIdFor(enrollment)));
    const paypalOff = threeWayTicks({ receipt: { fingerprint: fp, source: "" }, boughtOnFile: true, onSale: { fingerprint: fp, source: "" }, paypal: read(edited) });
    expect(paypalOff.map((c) => c.status)).toEqual(["tick", "tick", "cross"]);
    const saleOff = threeWayTicks({ receipt: { fingerprint: fp, source: "" }, boughtOnFile: true, onSale: { fingerprint: other, source: "" }, paypal: null });
    expect(saleOff.map((c) => c.status)).toEqual(["tick", "cross", "unread"]);
    const neverSold = threeWayTicks({ receipt: { fingerprint: other, source: "" }, boughtOnFile: false, onSale: { fingerprint: fp, source: "" } });
    expect(neverSold.map((c) => c.status)).toEqual(["cross", "cross", "unread"]);
  });

  it("never ticks PayPal for an order from before the terms went on PayPal's record", () => {
    const old = checkOrderTerms(enrollment, order(undefined, undefined));
    expect(old.status).toBe("missing");
    expect(threeWayTicks({ receipt: { fingerprint: fp, source: "" }, boughtOnFile: true, onSale: { fingerprint: fp, source: "" }, paypal: read(old) })[2].status).toBe("cross");
  });
});
