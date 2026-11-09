/**
 * The guarantee written on PayPal's own records. The order's item line, shown in PayPal's checkout
 * window, names the rubric version and fingerprint and the refund rule; the order's invoice_id
 * carries the same fingerprint, so it lands in the buyer's PayPal history and email. A refund
 * carries that invoice_id and a note_to_payer with the scores. Code builds every word here; the
 * agent never writes them. Server only.
 */
import { moneyFromMinor } from "@/lib/money";
import { getPayPal } from "@/lib/paypal";
import type { Order, PurchaseUnitRequest } from "@/lib/paypal/types";
import { CURRENCY } from "./content";
import { courseTitleOf, rubricShownFor } from "./creator-store";
import { enrollmentIfAny } from "./enrollments";
import { countsTowardRefund } from "./policy";
import type { Enrollment } from "./types";

/** PayPal's limits: item name and invoice_id 127 characters, note_to_payer 255. */
const ITEM_NAME_MAX = 127;
const NOTE_MAX = 255;

export const REFUND_RULE = "Full refund if you fail the public final check twice.";

type Locked = Pick<Enrollment, "id" | "courseId" | "rubric" | "priceCents">;

const lockOf = (enrollment: Pick<Enrollment, "rubric">) => enrollment.rubric ?? { version: "1", fingerprint: "" };

/** "PR-v1-ada21f9fbe03-en_1a2b3c4d": unique per purchase, because PayPal refuses a reused invoice_id. */
export function invoiceIdFor(enrollment: Pick<Enrollment, "id" | "rubric">): string {
  const { version, fingerprint } = lockOf(enrollment);
  return `PR-v${version}-${fingerprint}-${enrollment.id}`;
}

/** "Sharp at Home · rubric v1 · ada21f9fbe03": the title is cut, never the terms. */
export function itemNameFor(enrollment: Pick<Enrollment, "courseId" | "rubric">): string {
  const { version, fingerprint } = lockOf(enrollment);
  const terms = ` · rubric v${version} · ${fingerprint}`;
  const title = courseTitleOf(enrollment);
  const room = ITEM_NAME_MAX - terms.length;
  return `${title.length > room ? `${title.slice(0, room - 1).trimEnd()}…` : title}${terms}`;
}

export const itemDescriptionFor = () => `${REFUND_RULE} Terms locked to this fingerprint.`;

/** The purchase unit of the course order: the price from the course, the terms from the lock. */
export function orderPurchaseUnit(enrollment: Locked, description: string): PurchaseUnitRequest {
  const price = moneyFromMinor(enrollment.priceCents, CURRENCY);
  return {
    amount: { ...price, breakdown: { item_total: price } },
    description,
    custom_id: enrollment.id,
    invoice_id: invoiceIdFor(enrollment),
    items: [{ name: itemNameFor(enrollment), description: itemDescriptionFor(), quantity: "1", unit_amount: price, category: "DIGITAL_GOODS" }],
  };
}

/** "Guarantee refund, rubric v1 ada21f9fbe03: scored 61 and 48, pass mark 70. Sorry we let you down." */
export function refundNoteFor(enrollment: Pick<Enrollment, "courseId" | "rubric" | "attempts">): string {
  const { version, fingerprint } = lockOf(enrollment);
  const scores = enrollment.attempts.filter(countsTowardRefund).map((a) => a.score);
  const scored = scores.length ? `scored ${scores.length > 1 ? `${scores.slice(0, -1).join(", ")} and ${scores.at(-1)}` : scores[0]}, ` : "";
  const note = `Guarantee refund, rubric v${version} ${fingerprint}: ${scored}pass mark ${rubricShownFor(enrollment).passMark}. Sorry we let you down.`;
  return note.slice(0, NOTE_MAX);
}

export interface PayPalTermsCheck {
  /** "matches": PayPal's order carries the fingerprint bought. "missing": an order from before terms went on PayPal. */
  status: "matches" | "changed" | "missing";
  orderId: string;
  invoiceId?: string;
  itemName?: string;
  expectedInvoiceId: string;
}

/** What PayPal's own record of the order says, against the fingerprint this purchase locked. */
export function checkOrderTerms(enrollment: Pick<Enrollment, "id" | "rubric">, order: Pick<Order, "id" | "purchase_units">): PayPalTermsCheck {
  const unit = order.purchase_units?.[0];
  const invoiceId = unit?.invoice_id;
  const itemName = unit?.items?.[0]?.name;
  const expectedInvoiceId = invoiceIdFor(enrollment);
  const base = { orderId: order.id, invoiceId, itemName, expectedInvoiceId };
  if (!invoiceId && !itemName) return { ...base, status: "missing" };
  const { version, fingerprint } = lockOf(enrollment);
  const named = Boolean(itemName?.includes(`rubric v${version} · ${fingerprint}`));
  return { ...base, status: invoiceId === expectedInvoiceId && named ? "matches" : "changed" };
}

/**
 * Reads the order back from PayPal (GET /v2/checkout/orders/{id}) and checks its terms. Null when
 * there's no such paid purchase, or PayPal can't be reached: the page then shows the two-way check.
 */
export async function readOrderTerms(enrollmentId: string): Promise<PayPalTermsCheck | null> {
  const enrollment = enrollmentIfAny(enrollmentId);
  const orderId = enrollment?.payment?.orderId;
  if (!enrollment || !orderId) return null;
  const order = await getPayPal().orders.get(orderId).catch(() => null);
  return order ? checkOrderTerms(enrollment, order) : null;
}
