import { FAILS_FOR_REFUND, formatCents } from "./policy";

/** Isomorphic: the learner's "Your guarantee" strip and the three-column tick on /rubric both read from here. */

const WORDS = ["zero", "one", "two", "three", "four", "five"];
const inWords = (n: number) => WORDS[n] ?? String(n);

/** "PR-v1-ada21f9fbe03-en_1a2b3c4d": unique per purchase, because PayPal refuses a reused invoice_id. */
export function invoiceIdFor(enrollment: { id: string; rubric?: { version: string; fingerprint: string } }): string {
  const { version, fingerprint } = enrollment.rubric ?? { version: "1", fingerprint: "" };
  return `PR-v${version}-${fingerprint}-${enrollment.id}`;
}

/** The whole promise in one line, from the price paid and the pass mark of the rubric bought. */
export function guaranteeLine({ priceCents, passMark }: { priceCents: number; passMark: number }) {
  const price = formatCents(priceCents);
  return {
    price,
    passMark: `Pass mark ${passMark} of 100`,
    tries: `${inWords(FAILS_FOR_REFUND).replace(/^./, (c) => c.toUpperCase())} tries`,
    refund: `Fail both and PayPal pays back the full ${price}, once a person approves.`,
  };
}

/** The fingerprint PayPal's order carries, from its item line ("… · rubric v1 · ada21f9fbe03") or its invoice_id. */
export function fingerprintOnOrder(order: { itemName?: string; invoiceId?: string }): string | undefined {
  return /rubric v[^ ]+ · ([0-9a-f]{12})/.exec(order.itemName ?? "")?.[1] ?? /^PR-v[^-]+-([0-9a-f]{12})-/.exec(order.invoiceId ?? "")?.[1];
}

export type TickStatus = "tick" | "cross" | "unread";
export interface TickColumn {
  key: "receipt" | "on-sale" | "paypal";
  title: string;
  status: TickStatus;
  fingerprint?: string;
  /** Where the column's value was read from, in a few words. */
  source: string;
}

/**
 * Receipt | Rubric on sale | PayPal. Each column is ticked only from what was actually read:
 * the receipt's fingerprint has to be one we kept the words for, the rubric on sale and PayPal's
 * order have to carry that same fingerprint. PayPal is "unread" when this check didn't read the order.
 */
export function threeWayTicks({
  receipt,
  boughtOnFile,
  onSale,
  paypal,
}: {
  receipt: { fingerprint: string; source: string };
  boughtOnFile: boolean;
  onSale: { fingerprint: string; source: string };
  paypal?: { fingerprint?: string; source: string } | null;
}): TickColumn[] {
  const same = (fp?: string) => Boolean(fp) && fp === receipt.fingerprint;
  return [
    { key: "receipt", title: "Your receipt", status: boughtOnFile ? "tick" : "cross", fingerprint: receipt.fingerprint, source: receipt.source },
    { key: "on-sale", title: "Rubric on sale", status: same(onSale.fingerprint) ? "tick" : "cross", fingerprint: onSale.fingerprint, source: onSale.source },
    paypal
      ? { key: "paypal", title: "PayPal's order", status: same(paypal.fingerprint) ? "tick" : "cross", fingerprint: paypal.fingerprint, source: paypal.source }
      : { key: "paypal", title: "PayPal's order", status: "unread", source: "Not read: open this check from your receipt, or paste your order id on /verify." },
  ];
}
