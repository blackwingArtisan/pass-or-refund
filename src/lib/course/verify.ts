/**
 * /verify: a buyer pastes PayPal's order id or the order's invoice_id, and the order is read back
 * from PayPal (GET /v2/checkout/orders/{id}). What PayPal holds (rubric version, fingerprint and the
 * guarantee on the item line) is set beside the public rubric's own hash. Reads only. It shows no
 * learner data: no name, email, answers or payer, only the terms PayPal carries. Server only.
 */
import { getPayPal } from "@/lib/paypal";
import type { Order } from "@/lib/paypal/types";
import { creatorCourseId, creatorCoursePath, creatorCourses } from "./creator-store";
import { enrollmentIfAny } from "./enrollments";
import { REFUND_RULE } from "./order-terms";
import { rubricFingerprint, rubricVersion } from "./rubric-lock";

/** "PR-v1-ada21f9fbe03-en_1a2b3c4d": the invoice_id this app writes on every course order. */
const INVOICE = /^PR-v(\d+)-([0-9a-f]{12})-(en_[A-Za-z0-9_-]+)$/;
/** PayPal order ids are 17 capital letters and digits. */
const ORDER_ID = /^[A-Z0-9]{17}$/;
/** "Sharp at Home · rubric v1 · ada21f9fbe03" */
const ITEM_TERMS = /rubric v(\d+) · ([0-9a-f]{12})/;

export type VerifyQuery = { kind: "invoice"; invoiceId: string; version: string; fingerprint: string; enrollmentId: string } | { kind: "order"; orderId: string };

/** What the buyer pasted, or null when it is neither an order id nor one of this app's invoice ids. */
export function parseVerifyQuery(raw: string): VerifyQuery | null {
  const text = raw.trim();
  const invoice = text.match(INVOICE);
  if (invoice) return { kind: "invoice", invoiceId: text, version: invoice[1], fingerprint: invoice[2], enrollmentId: invoice[3] };
  const id = text.toUpperCase();
  return ORDER_ID.test(id) ? { kind: "order", orderId: id } : null;
}

export interface PayPalTerms {
  invoiceId?: string;
  itemName?: string;
  /** The guarantee as PayPal holds it: the item line's description. */
  guarantee?: string;
  version?: string;
  fingerprint?: string;
  /** The invoice_id and the item line name the same rubric. */
  agree: boolean;
}

/** The terms on PayPal's record of an order, and nothing else from it. */
export function termsOnOrder(order: Pick<Order, "purchase_units">): PayPalTerms {
  const unit = order.purchase_units?.[0];
  const item = unit?.items?.[0];
  const fromInvoice = unit?.invoice_id?.match(INVOICE);
  const fromItem = item?.name?.match(ITEM_TERMS);
  const version = fromInvoice?.[1] ?? fromItem?.[1];
  const fingerprint = fromInvoice?.[2] ?? fromItem?.[2];
  const agree = Boolean(fromInvoice && fromItem && fromInvoice[1] === fromItem[1] && fromInvoice[2] === fromItem[2]);
  return { invoiceId: unit?.invoice_id, itemName: item?.name, guarantee: item?.description, version, fingerprint, agree };
}

export interface PublicRubric {
  title: string;
  version: string;
  /** Worked out here from the published rubric's bytes, not copied from anywhere. */
  fingerprint: string;
  href: string;
}

/** The public rubric with this version whose bytes hash to this fingerprint: the sample course's, or a creator's. */
export function publicRubricFor(version: string, fingerprint: string): PublicRubric | null {
  const sample = rubricVersion(version);
  if (sample && rubricFingerprint(sample.rubric) === fingerprint) return { title: sample.rubric.title, version, fingerprint, href: `/rubric?v=${version}&fp=${fingerprint}` };
  const creator = creatorCourses().get(creatorCourseId(fingerprint));
  if (creator && rubricFingerprint(creator.rubric) === fingerprint) return { title: creator.rubric.title, version, fingerprint, href: creatorCoursePath(creator.id) };
  return null;
}

/** The sample course's public rubric of this version, hashed now: what a fingerprint that matches nothing is set against. */
function sampleRubricNow(version: string): PublicRubric | null {
  const sample = rubricVersion(version) ?? rubricVersion("1");
  return sample ? { title: sample.rubric.title, version: sample.version, fingerprint: rubricFingerprint(sample.rubric), href: `/rubric?v=${sample.version}` } : null;
}

export type VerifyStatus = "match" | "no-match" | "no-terms" | "not-found" | "unrecognised";

export interface Verification {
  status: VerifyStatus;
  query: string;
  /** The read this page made, as PayPal's API names it. */
  call?: string;
  orderId?: string;
  orderStatus?: string;
  paypal?: PayPalTerms;
  rubric?: PublicRubric | null;
  /** Why it doesn't match, in plain words. */
  reason?: string;
}

/**
 * Reads the order back from PayPal and checks it. An order id is read from PayPal directly. An
 * invoice_id names the purchase it was written for, so its order id comes from that purchase, and
 * PayPal's record must carry that exact invoice_id.
 */
export async function verifyOnPayPal(raw: string): Promise<Verification> {
  const query = raw.trim().slice(0, 200);
  const parsed = parseVerifyQuery(query);
  if (!parsed) return { status: "unrecognised", query };
  const orderId = parsed.kind === "order" ? parsed.orderId : enrollmentIfAny(parsed.enrollmentId)?.payment?.orderId;
  if (!orderId) return { status: "not-found", query, reason: "No purchase on this site carries that invoice id." };
  const call = `GET /v2/checkout/orders/${orderId}`;
  const order = await getPayPal().orders.get(orderId).catch(() => null);
  if (!order) return { status: "not-found", query, call, orderId, reason: "PayPal has no order with that id for this site." };
  const paypal = termsOnOrder(order);
  const base = { query, call, orderId, orderStatus: order.status, paypal };
  if (!paypal.version || !paypal.fingerprint) return { ...base, status: "no-terms", reason: "PayPal's record of this order carries no rubric terms: it was placed before the terms went on PayPal's order, or isn't a course order." };
  const rubric = publicRubricFor(paypal.version, paypal.fingerprint);
  const reason =
    parsed.kind === "invoice" && paypal.invoiceId !== parsed.invoiceId
      ? "PayPal's order carries a different invoice id from the one you pasted."
      : !paypal.agree
        ? "The order's invoice id and its item line name different rubrics."
        : !paypal.guarantee?.startsWith(REFUND_RULE)
          ? "PayPal's item line doesn't carry the guarantee."
          : !rubric
            ? "No public rubric hashes to the fingerprint PayPal holds: the rubric was changed after this purchase."
            : undefined;
  return { ...base, status: reason ? "no-match" : "match", rubric: rubric ?? sampleRubricNow(paypal.version), reason };
}
